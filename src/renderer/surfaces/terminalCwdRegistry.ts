/**
 * Live cwd tracking for container terminals (M-J2-S2).
 *
 * A container terminal has no persistent cwd — each `container machine run`
 * starts a fresh login shell. To make a *new* container terminal open where the
 * last one was, we track each container terminal's live cwd here: the guest
 * shell reports it via OSC 7 (a `PROMPT_COMMAND` hook injected at spawn), the
 * renderer parses the path and records it against the terminal's `surfaceId`,
 * and a new terminal reads back its most-recently-focused sibling's cwd just
 * before it spawns.
 *
 * Scope is a single workspace (machine) — container paths aren't portable across
 * machines, and host terminals are never recorded here (they already inherit the
 * workspace cwd, so cwd inheritance is container-only by design). In-memory only;
 * nothing is persisted.
 */

interface ContainerTerminalCwd {
  workspaceId: string
  /** Last cwd reported via OSC 7; undefined until the shell first reports one. */
  cwd?: string
  /** Monotonic focus rank; the highest marks the most-recently-focused terminal. */
  focusRank: number
}

/** surfaceId → its live cwd entry. */
const entries = new Map<string, ContainerTerminalCwd>()

/** Ever-incrementing focus counter — deterministic ordering without a clock. */
let focusClock = 0

/**
 * Parse an OSC 7 payload (`file://<host>/<path>`) to its absolute path, or null
 * when it isn't a parseable `file://` URI. The host segment is ignored (we only
 * want the path); percent escapes (e.g. `%20`) are decoded.
 */
export function parseOsc7Path(payload: string): string | null {
  const match = /^file:\/\/[^/]*(\/.*)$/.exec(payload)
  if (!match) {
    return null
  }
  const path = match[1]!
  try {
    return decodeURIComponent(path)
  } catch {
    // Malformed percent-encoding — fall back to the raw path rather than drop it.
    return path
  }
}

/** Record (or update) a container terminal's live cwd, keyed by `surfaceId`. */
export function recordContainerCwd(workspaceId: string, surfaceId: string, cwd: string): void {
  const entry = entries.get(surfaceId)
  if (entry) {
    entry.cwd = cwd
  } else {
    entries.set(surfaceId, { workspaceId, cwd, focusRank: 0 })
  }
}

/** Mark a container terminal as the most-recently-focused in its workspace. */
export function recordContainerFocus(workspaceId: string, surfaceId: string): void {
  focusClock += 1
  const entry = entries.get(surfaceId)
  if (entry) {
    entry.focusRank = focusClock
  } else {
    entries.set(surfaceId, { workspaceId, focusRank: focusClock })
  }
}

/** Drop a container terminal's entry (on unmount / PTY exit). */
export function forgetContainerTerminal(surfaceId: string): void {
  entries.delete(surfaceId)
}

/**
 * The cwd of the most-recently-focused container terminal in `workspaceId` that
 * has reported one, or undefined when none has — so a fresh terminal falls back
 * to the machine's default home. Terminals in other workspaces are ignored.
 */
export function lastFocusedContainerCwd(workspaceId: string): string | undefined {
  let best: ContainerTerminalCwd | null = null
  for (const entry of entries.values()) {
    if (entry.workspaceId !== workspaceId || entry.cwd === undefined) {
      continue
    }
    if (!best || entry.focusRank > best.focusRank) {
      best = entry
    }
  }
  return best?.cwd
}

/** Test-only: clear every entry and reset the focus counter. */
export function __resetContainerCwdRegistry(): void {
  entries.clear()
  focusClock = 0
}
