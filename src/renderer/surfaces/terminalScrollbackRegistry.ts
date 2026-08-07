/**
 * Terminal restore-state side-channel (PRD-4, AC4.3).
 *
 * The twin of {@link editorStateRegistry}, for the other backend-bound surface
 * whose *content* the layout engine can't see. A terminal's value is its screen
 * and scrollback — the commands run and what they printed — and that lives
 * inside the xterm instance, not the layout tree. This module bridges the gap
 * with the same three roles:
 *
 *   1. **capture** — each live terminal registers a getter that reads its
 *      current screen + scrollback as plain text; the autosave calls
 *      {@link captureTerminalStates} at persist time to snapshot every terminal
 *      in a workspace into {@link SurfaceStateEntry}[], which rides the same
 *      host-side store as the editors (AC4.5 — independent of backend lifetime).
 *   2. **restore** — on boot the App seeds the loaded snapshot's `surfaces` here
 *      and each terminal pops its payload on mount ({@link takeTerminalRestore})
 *      to replay the preserved scrollback *above* its freshly spawned PTY, which
 *      is the J4-S3 rehydrate shape: a working shell with the dead session's
 *      history readable above it.
 *   3. **change notification** — PTY output doesn't mutate the layout, so it
 *      wouldn't otherwise trigger a persist. Terminals call
 *      {@link notifyTerminalChanged} as bytes arrive and the autosave subscribes
 *      via {@link subscribeTerminalChanges}. Unlike editor edits this is a
 *      *firehose* — a `yes` or a build log would re-arm the autosave's debounce
 *      forever and it would never actually fire — so the notification is
 *      throttled here to at most one per {@link NOTIFY_INTERVAL_MS}.
 *
 * Text, not styling: the payload keeps `translateToString`'d lines, which is
 * what AC4.3 asks to preserve (실행한 명령과 그 결과). Colors and cursor
 * attributes are dropped, and the line count is capped
 * ({@link MAX_SCROLLBACK_LINES}) so a long-lived terminal can't grow the
 * snapshot without bound.
 *
 * No xterm or DOM imports: this stays a pure module so the node test env can
 * exercise the round-trip directly, exactly like the editor registry.
 */
import type { SurfaceStateEntry } from '@shared/types'

/** Restorable content for one terminal tab (AC4.3). */
export interface TerminalContent {
  /** Screen + scrollback as plain-text lines, oldest first. */
  lines: string[]
}

/** Reads a live terminal's current restorable content. */
type TerminalGetter = () => TerminalContent

interface GetterEntry {
  workspaceId: string
  tabId: string
  get: TerminalGetter
}

/**
 * Cap on persisted lines per terminal. A restored terminal re-captures the
 * history it just replayed, so without a cap each restart would compound the
 * snapshot; the cap keeps it at a bounded, still-generous window.
 */
export const MAX_SCROLLBACK_LINES = 1000

/** Minimum gap between autosave nudges from a terminal's output firehose. */
export const NOTIFY_INTERVAL_MS = 5_000

/** Dim header written above replayed scrollback so it reads as history. */
export const RESTORED_HEADER = '[이전 세션 기록 복원됨]'

/** Dim footer marking where the freshly spawned PTY takes over. */
export const RESTORED_FOOTER = '[여기서부터 새 세션]'

/** `(workspaceId, tabId)` → live-content getter, for capture at persist time. */
const getters = new Map<string, GetterEntry>()
/** `(workspaceId, tabId)` → content seeded from a loaded snapshot, awaiting mount. */
const restorePayloads = new Map<string, TerminalContent>()
/** workspaceId → autosave change listeners. */
const changeListeners = new Map<string, Set<() => void>>()
/** workspaceId → timestamp of the last notification that actually fired. */
const lastNotifiedAt = new Map<string, number>()

/** Collision-proof, printable key for the `(workspaceId, tabId)` pair. */
function key(workspaceId: string, tabId: string): string {
  return JSON.stringify([workspaceId, tabId])
}

/**
 * Normalize captured lines for persistence: drop the trailing blank rows every
 * xterm screen carries below the cursor, then keep only the most recent
 * {@link MAX_SCROLLBACK_LINES}. Pure — the surface hands in raw rows.
 */
export function trimScrollbackLines(lines: string[], max: number = MAX_SCROLLBACK_LINES): string[] {
  let end = lines.length
  while (end > 0 && lines[end - 1]!.trim() === '') end -= 1
  const trimmed = lines.slice(0, end)
  if (max <= 0) return []
  return trimmed.length > max ? trimmed.slice(trimmed.length - max) : trimmed
}

/**
 * Render preserved lines as a writable xterm payload — the history block plus
 * dim header/footer, in the same `\x1b[2m…\x1b[0m` idiom the surface already
 * uses for its process-exited notice. Empty in, empty out (nothing to replay).
 */
export function formatRestoredScrollback(lines: string[]): string {
  if (lines.length === 0) return ''
  const body = lines.join('\r\n')
  return `\x1b[2m${RESTORED_HEADER}\x1b[0m\r\n${body}\r\n\x1b[2m${RESTORED_FOOTER}\x1b[0m\r\n`
}

/* ------------------------------------------------------------------ capture */

/** Register a live terminal's content getter (on mount). */
export function registerTerminalState(
  workspaceId: string,
  tabId: string,
  get: TerminalGetter
): void {
  getters.set(key(workspaceId, tabId), { workspaceId, tabId, get })
}

/** Drop a live terminal's getter (on unmount). */
export function forgetTerminalState(workspaceId: string, tabId: string): void {
  getters.delete(key(workspaceId, tabId))
}

/**
 * Snapshot every registered terminal in `workspaceId` into surface entries. A
 * getter that throws is skipped rather than failing the whole persist, and an
 * empty terminal contributes no entry — there is nothing to restore from it.
 */
export function captureTerminalStates(workspaceId: string): SurfaceStateEntry[] {
  const entries: SurfaceStateEntry[] = []
  for (const entry of getters.values()) {
    if (entry.workspaceId !== workspaceId) continue
    let content: TerminalContent
    try {
      content = entry.get()
    } catch {
      continue
    }
    const lines = trimScrollbackLines(content.lines)
    if (lines.length === 0) continue
    entries.push({ tabId: entry.tabId, surface: 'terminal', content: { lines } })
  }
  return entries
}

/* ------------------------------------------------------------------ restore */

/** Seed a loaded snapshot's terminal surfaces so mounting terminals can replay. */
export function seedTerminalRestore(workspaceId: string, surfaces: SurfaceStateEntry[]): void {
  for (const surface of surfaces) {
    if (surface.surface !== 'terminal') continue
    const content = surface.content as Partial<TerminalContent> | null | undefined
    if (!content || !Array.isArray(content.lines)) continue
    const lines = content.lines.filter((line): line is string => typeof line === 'string')
    if (lines.length === 0) continue
    restorePayloads.set(key(workspaceId, surface.tabId), { lines: trimScrollbackLines(lines) })
  }
}

/**
 * The restore payload for a terminal tab, or null when there is none. Unlike
 * the editor's peek this *consumes* the entry: replaying is a write into the
 * xterm buffer, so a StrictMode double-mount would otherwise print the same
 * history twice.
 */
export function takeTerminalRestore(workspaceId: string, tabId: string): TerminalContent | null {
  const k = key(workspaceId, tabId)
  const content = restorePayloads.get(k)
  if (!content) return null
  restorePayloads.delete(k)
  return content
}

/* ------------------------------------------------------ change notification */

/** Subscribe to terminal output in a workspace (an autosave trigger). */
export function subscribeTerminalChanges(workspaceId: string, listener: () => void): () => void {
  let set = changeListeners.get(workspaceId)
  if (!set) {
    set = new Set()
    changeListeners.set(workspaceId, set)
  }
  set.add(listener)
  return () => {
    const current = changeListeners.get(workspaceId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) changeListeners.delete(workspaceId)
  }
}

/**
 * Nudge a workspace's autosave that a terminal produced output, at most once per
 * {@link NOTIFY_INTERVAL_MS}. `now` is injected (no clock here) so the throttle
 * is directly testable. Returns whether the notification actually fired.
 */
export function notifyTerminalChanged(workspaceId: string, now: number): boolean {
  const last = lastNotifiedAt.get(workspaceId)
  if (last !== undefined && now - last < NOTIFY_INTERVAL_MS) return false
  lastNotifiedAt.set(workspaceId, now)
  const set = changeListeners.get(workspaceId)
  if (!set) return false
  for (const listener of set) listener()
  return true
}

/** Test-only: clear all registry state between cases. */
export function __resetTerminalScrollbackRegistry(): void {
  getters.clear()
  restorePayloads.clear()
  changeListeners.clear()
  lastNotifiedAt.clear()
}
