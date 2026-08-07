/**
 * Editor restore-state side-channel (PRD-4, AC4.1).
 *
 * A workspace's autosave (WorkspaceView) persists the layout skeleton whenever
 * the layout changes, but an editor's *content* — its unsaved buffer and cursor
 * — lives inside the CodeMirror view, invisible to the layout engine. This
 * module bridges that gap the same way {@link terminalCwdRegistry} bridges live
 * container cwds: a plain in-memory registry keyed by `(workspaceId, tabId)`,
 * with three roles —
 *
 *   1. **capture** — each live editor registers a getter that reads its current
 *      buffer + primary selection; the autosave calls {@link captureEditorStates}
 *      at persist time to snapshot every editor in a workspace into
 *      {@link SurfaceStateEntry}[].
 *   2. **restore** — on boot the App seeds the loaded snapshot's `surfaces` here
 *      and each editor pops its payload on mount ({@link takeEditorRestore}) to
 *      rehydrate the buffer, so an unsaved edit survives a restart (AC4.1).
 *   3. **change notification** — editing doesn't mutate the layout, so it
 *      wouldn't otherwise trigger a persist; an editor calls
 *      {@link notifyEditorChanged} on every doc change and the autosave subscribes
 *      via {@link subscribeEditorChanges} to debounce a save, so an edit made
 *      just before a backend/app death is still captured.
 *
 * No CodeMirror or DOM imports: this stays a pure module so the node test env can
 * exercise the round-trip directly (the surfaces barrel pulls CodeMirror, which
 * is browser-only). Content payloads are keyed by tab *and* workspace because a
 * fresh workspace's first tab always has the same id (`P-single-t0`).
 */
import type { SurfaceStateEntry } from '@shared/types'

/**
 * Restorable content for one editor tab (AC4.1). Only the primary selection is
 * kept — `anchor`/`head` cover a plain cursor (anchor === head) and a range
 * alike, which is what the AC calls for (커서/선택 위치).
 */
export interface EditorContent {
  text: string
  anchor: number
  head: number
}

/** Reads a live editor's current restorable content. */
type EditorGetter = () => EditorContent

interface GetterEntry {
  workspaceId: string
  tabId: string
  get: EditorGetter
}

/** `(workspaceId, tabId)` → live-content getter, for capture at persist time. */
const getters = new Map<string, GetterEntry>()
/** `(workspaceId, tabId)` → content seeded from a loaded snapshot, awaiting mount. */
const restorePayloads = new Map<string, EditorContent>()
/** workspaceId → autosave change listeners. */
const changeListeners = new Map<string, Set<() => void>>()

/** Collision-proof, printable key for the `(workspaceId, tabId)` pair. */
function key(workspaceId: string, tabId: string): string {
  return JSON.stringify([workspaceId, tabId])
}

/**
 * Clamp a persisted offset into a restored document's bounds. A payload whose
 * cursor sits past the (possibly shorter, or corrupt) restored text must not
 * throw when the selection is applied.
 */
export function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset) || offset < 0) return 0
  return offset > length ? length : Math.floor(offset)
}

/* ------------------------------------------------------------------ capture */

/** Register a live editor's content getter (on mount). */
export function registerEditorState(workspaceId: string, tabId: string, get: EditorGetter): void {
  getters.set(key(workspaceId, tabId), { workspaceId, tabId, get })
}

/** Drop a live editor's getter (on unmount). */
export function forgetEditorState(workspaceId: string, tabId: string): void {
  getters.delete(key(workspaceId, tabId))
}

/**
 * Snapshot every registered editor in `workspaceId` into surface entries. A
 * getter that throws is skipped rather than failing the whole persist.
 */
export function captureEditorStates(workspaceId: string): SurfaceStateEntry[] {
  const entries: SurfaceStateEntry[] = []
  for (const entry of getters.values()) {
    if (entry.workspaceId !== workspaceId) continue
    let content: EditorContent
    try {
      content = entry.get()
    } catch {
      continue
    }
    entries.push({ tabId: entry.tabId, surface: 'editor', content })
  }
  return entries
}

/* ------------------------------------------------------------------ restore */

/** Seed a loaded snapshot's editor surfaces so mounting editors can rehydrate. */
export function seedEditorRestore(workspaceId: string, surfaces: SurfaceStateEntry[]): void {
  for (const surface of surfaces) {
    if (surface.surface !== 'editor') continue
    const content = surface.content as Partial<EditorContent> | null | undefined
    if (!content || typeof content.text !== 'string') continue
    restorePayloads.set(key(workspaceId, surface.tabId), {
      text: content.text,
      anchor: typeof content.anchor === 'number' ? content.anchor : 0,
      head: typeof content.head === 'number' ? content.head : 0
    })
  }
}

/**
 * The restore payload for an editor tab, or null when there is none. Peeks
 * rather than deletes so a StrictMode double-mount still restores; the entry is
 * harmless once the live editor takes over its own content.
 */
export function takeEditorRestore(workspaceId: string, tabId: string): EditorContent | null {
  return restorePayloads.get(key(workspaceId, tabId)) ?? null
}

/* ------------------------------------------------------ change notification */

/** Subscribe to editor content changes in a workspace (an autosave trigger). */
export function subscribeEditorChanges(workspaceId: string, listener: () => void): () => void {
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

/** Notify a workspace's autosave that an editor's content changed. */
export function notifyEditorChanged(workspaceId: string): void {
  const set = changeListeners.get(workspaceId)
  if (!set) return
  for (const listener of set) listener()
}

/** Test-only: clear all registry state between cases. */
export function __resetEditorStateRegistry(): void {
  getters.clear()
  restorePayloads.clear()
  changeListeners.clear()
}
