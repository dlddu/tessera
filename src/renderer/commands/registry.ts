/**
 * Shared command registry (J2-S5, AC2.5). The single source of truth for every
 * keyboard-driven operation Tessera exposes — the layout keymap, the App-level
 * workspace keys, the ⌘K command palette, and the key-hint surfaces (overlay +
 * status bar) all consume this one list. Before this, each command lived inline
 * in a `keydown` branch and the hint keycaps were hand-typed in three places; a
 * rebinding could silently drift out of sync. First-classing commands here means
 * one definition drives dispatch, discovery, and the on-screen hint.
 *
 * A {@link Command} bundles the palette-facing metadata (`label`, `keycap`,
 * `identityVar` dot, `scope`) with two behaviours: `match(e)` — the exact
 * physical chord that triggers it (used by the keymap dispatcher) — and
 * `run(ctx, e?)` — the effect, invoked with a {@link CommandContext}. Both the
 * keymap (passing the live `KeyboardEvent`) and the palette (passing nothing)
 * call the same `run`, so a command behaves identically however it is reached
 * (AC2.5 — same UI/操作 for host and container, which is structural since none of
 * these operations branch on the backend).
 *
 * Directional families (focus / tab-move) and the tab-switch cycle are single
 * commands whose `match` accepts any of their arrows/brackets and whose `run`
 * reads the direction from the event; the palette runs a sensible representative
 * (→ / next). This keeps the palette one-row-per-operation (matching M-J2-S5)
 * while the keymap still drives all four directions.
 *
 * Kept free of browser-only imports (no xterm/CodeMirror) so it loads in the
 * node test environment: {@link LayoutActions} is a type-only import.
 */
import type { LayoutActions } from '@renderer/layout/useLayout'
import type { FocusDirection } from '@renderer/layout'

/** Which of the two shortcut groups a command belongs to (palette grouping). */
export type CommandScope = 'layout' | 'workspace'

/**
 * A pending surface choice raised by the create commands (split / add tab): the
 * pane it targets and what the pick will do. The owning view opens the shared
 * {@link SurfacePicker} for it. Shared here so a command's `run` can raise one.
 */
export interface PendingPick {
  action: 'add' | 'split-v' | 'split-h'
  paneId: string
}

/**
 * Everything a command's `run` may need. Built fresh at dispatch/execution time
 * so `focusedPaneId` is always live. Callers that don't own a field pass a
 * no-op (e.g. App has no layout; the palette never switches workspaces by
 * index) — a command only touches the fields its own effect uses.
 */
export interface CommandContext {
  /** Layout mutations (split / tab / focus / zoom). AC1.2/1.4/1.6. */
  layout: LayoutActions
  /** Raise a surface pick (split / add tab) — opens the SurfacePicker. */
  setPending: (pick: PendingPick) => void
  /** The focused pane id at call time — the target of create commands. */
  focusedPaneId: string | null
  /** Toggle the on-demand key-hint overlay (⌘⌥/). */
  toggleKeymap: () => void
  /** Workspace-level operations (new / switch / close). AC1.7. */
  workspace: WorkspaceCommandHandlers
  /** Host-only area open/close (⌃⌘H / ⇧⌃⌘H). AC2.7. */
  hostArea: HostAreaCommandHandlers
}

/** The workspace-scope effects, supplied by the App shell. */
export interface WorkspaceCommandHandlers {
  /** Open the new-workspace dialog (⌘N). */
  create: () => void
  /** Close the current workspace (⇧⌘W). */
  close: () => void
  /** Switch to the workspace at a 0-based rail position (⌘1–9). No-op if none. */
  switchTo: (index: number) => void
  /** Switch to the next workspace in the rail (palette "전환"). */
  switchNext: () => void
}

/** The host-area effects, supplied by the workspace view. AC2.7. */
export interface HostAreaCommandHandlers {
  /** Open the container workspace's host-only area (⌃⌘H). No-op on host / if open. */
  open: () => void
  /** Close the host-only area (⇧⌃⌘H / band ×). No-op if none is open. */
  close: () => void
}

/** A keycap cluster: a modifier glyph run + the key glyph(s) it combines with. */
export interface KeyCap {
  /** Modifier glyphs, e.g. `⌘`, `⇧⌘`, `⌥⌘`, `⌃⌘`. macOS order (mod then ⌘). */
  mods: string
  /** Key glyphs, e.g. `['D']`, `['←','→','↑','↓']`, `['[',']']`. */
  keys: string[]
}

/** A first-classed, keyboard-driven operation. */
export interface Command {
  id: CommandId
  /** Palette label (Korean). */
  label: string
  /** Display keycap for the palette + hint surfaces. */
  keycap: KeyCap
  scope: CommandScope
  /** Identity-color CSS var for the palette row dot (decorative). */
  identityVar: string
  /** Exact physical chord that triggers this command (keymap dispatch). */
  match: (e: KeyboardEvent) => boolean
  /**
   * Run the command. The keymap passes the triggering event (so directional
   * commands can read their arrow); the palette passes nothing (representative).
   */
  run: (ctx: CommandContext, e?: KeyboardEvent) => void
}

export type CommandId =
  | 'split-v'
  | 'split-h'
  | 'add-tab'
  | 'close-tab'
  | 'focus'
  | 'move'
  | 'tab-switch'
  | 'zoom'
  | 'overlay'
  | 'open-host-area'
  | 'close-host-area'
  | 'new-workspace'
  | 'switch-workspace'
  | 'close-workspace'

/* --------------------------------------------------------------- key helpers */

/** Map an arrow key to a focus/move direction, or `null` for non-arrows. */
function arrowDirection(key: string): FocusDirection | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    default:
      return null
  }
}

/** True for a bare letter key match, case-insensitive. */
function isKey(e: KeyboardEvent, letter: string): boolean {
  return e.key === letter.toLowerCase() || e.key === letter.toUpperCase()
}

/* ------------------------------------------------------------------ commands */

// Ordering is presentation only (palette + hint surfaces iterate in place); the
// `match` predicates are mutually exclusive, so keymap dispatch is
// order-independent.
export const COMMANDS: readonly Command[] = [
  {
    id: 'split-v',
    label: 'pane 수직 분할',
    keycap: { mods: '⌘', keys: ['D'] },
    scope: 'layout',
    identityVar: '--id-term',
    // ⌘D — split the focused pane (vertical). Ctrl excluded so Ctrl+D still
    // reaches the terminal as EOF. Opens the picker rather than acting directly.
    match: (e) => e.metaKey && !e.ctrlKey && !e.shiftKey && isKey(e, 'd'),
    run: (ctx) => {
      if (ctx.focusedPaneId) ctx.setPending({ action: 'split-v', paneId: ctx.focusedPaneId })
    }
  },
  {
    id: 'split-h',
    label: 'pane 가로 분할',
    keycap: { mods: '⇧⌘', keys: ['D'] },
    scope: 'layout',
    identityVar: '--id-edit',
    // ⇧⌘D — split the focused pane (horizontal).
    match: (e) => e.metaKey && e.shiftKey && !e.ctrlKey && isKey(e, 'd'),
    run: (ctx) => {
      if (ctx.focusedPaneId) ctx.setPending({ action: 'split-h', paneId: ctx.focusedPaneId })
    }
  },
  {
    id: 'add-tab',
    label: '새 탭',
    keycap: { mods: '⌘', keys: ['T'] },
    scope: 'layout',
    identityVar: '--id-web',
    // ⌘T — add a tab to the focused pane (via the picker).
    match: (e) => e.metaKey && !e.ctrlKey && !e.shiftKey && isKey(e, 't'),
    run: (ctx) => {
      if (ctx.focusedPaneId) ctx.setPending({ action: 'add', paneId: ctx.focusedPaneId })
    }
  },
  {
    id: 'focus',
    label: '포커스 이동',
    keycap: { mods: '⌥⌘', keys: ['←', '→', '↑', '↓'] },
    scope: 'layout',
    identityVar: '--id-claude',
    // ⌥⌘+arrow — move focus to the neighbor in that direction.
    match: (e) =>
      e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && arrowDirection(e.key) !== null,
    run: (ctx, e) => ctx.layout.focusDirection(e ? (arrowDirection(e.key) ?? 'right') : 'right')
  },
  {
    id: 'move',
    label: '탭 이동',
    keycap: { mods: '⌃⌘', keys: ['←', '→', '↑', '↓'] },
    scope: 'layout',
    identityVar: '--id-term',
    // ⌃⌘+arrow — move the focused pane's active tab to the neighbor pane.
    match: (e) =>
      e.metaKey && e.ctrlKey && !e.altKey && !e.shiftKey && arrowDirection(e.key) !== null,
    run: (ctx, e) =>
      ctx.layout.moveActiveTabToDirection(e ? (arrowDirection(e.key) ?? 'right') : 'right')
  },
  {
    id: 'tab-switch',
    label: '탭 전환',
    keycap: { mods: '⇧⌘', keys: ['[', ']'] },
    scope: 'layout',
    identityVar: '--id-edit',
    // ⌘⇧[ / ⌘⇧] — switch the active tab within the focused pane. Match the
    // shifted glyphs ({ }) the bracket keys produce, plus the bare brackets.
    // `]`/`}` → next, `[`/`{` → prev; the palette (no event) advances to next.
    match: (e) => e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && '[]{}'.includes(e.key),
    run: (ctx, e) => ctx.layout.cycleTab(!e || e.key === ']' || e.key === '}' ? 'next' : 'prev')
  },
  {
    id: 'zoom',
    label: '전체화면 토글',
    keycap: { mods: '⇧⌘', keys: ['⏎'] },
    scope: 'layout',
    identityVar: '--id-web',
    // ⇧⌘⏎ — toggle window-filling zoom on the focused pane.
    match: (e) => e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter',
    run: (ctx) => ctx.layout.toggleZoom()
  },
  {
    id: 'overlay',
    label: '단축키 오버레이',
    keycap: { mods: '⌥⌘', keys: ['/'] },
    scope: 'layout',
    identityVar: '--id-claude',
    // ⌘⌥/ — toggle the key-hint overlay. Matched by physical code so ⌥'s
    // remapped glyph doesn't matter and a typed "/" isn't eaten.
    match: (e) => e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'Slash',
    run: (ctx) => ctx.toggleKeymap()
  },
  {
    id: 'close-tab',
    label: '탭 닫기',
    keycap: { mods: '⌘', keys: ['W'] },
    scope: 'layout',
    identityVar: '--id-term',
    // ⌘W — close the focused pane's active tab. Closing the last tab closes the
    // workspace (the guarded `layout.closeActiveTab` handles that, AC1.7).
    match: (e) => e.metaKey && !e.ctrlKey && !e.shiftKey && isKey(e, 'w'),
    run: (ctx) => ctx.layout.closeActiveTab()
  },
  {
    id: 'open-host-area',
    label: 'host 영역 열기',
    keycap: { mods: '⌃⌘', keys: ['H'] },
    scope: 'layout',
    identityVar: '--id-term',
    // ⌃⌘H — open the container workspace's host-only escape area (AC2.7). No-op
    // on a host workspace or when a host area is already open (handled by `run`).
    match: (e) => e.metaKey && e.ctrlKey && !e.altKey && !e.shiftKey && isKey(e, 'h'),
    run: (ctx) => ctx.hostArea.open()
  },
  {
    id: 'close-host-area',
    label: 'host 영역 닫기',
    keycap: { mods: '⇧⌃⌘', keys: ['H'] },
    scope: 'layout',
    identityVar: '--id-term',
    // ⇧⌃⌘H — close the host-only area (the shift twin of ⌃⌘H). No-op if none.
    match: (e) => e.metaKey && e.ctrlKey && e.shiftKey && !e.altKey && isKey(e, 'h'),
    run: (ctx) => ctx.hostArea.close()
  },
  {
    id: 'new-workspace',
    label: '새 워크스페이스',
    keycap: { mods: '⌘', keys: ['N'] },
    scope: 'workspace',
    identityVar: '--id-edit',
    // ⌘N / Ctrl+N — open the new-workspace dialog.
    match: (e) => (e.metaKey || e.ctrlKey) && isKey(e, 'n'),
    run: (ctx) => ctx.workspace.create()
  },
  {
    id: 'switch-workspace',
    label: '워크스페이스 전환',
    keycap: { mods: '⌘', keys: ['1–9'] },
    scope: 'workspace',
    identityVar: '--id-web',
    // ⌘/Ctrl+1–9 — switch to the workspace at that rail position. From the
    // palette (no event) advance to the next workspace instead.
    match: (e) => {
      if ((!e.metaKey && !e.ctrlKey) || e.altKey || e.shiftKey) return false
      const n = Number(e.key)
      return Number.isInteger(n) && n >= 1 && n <= 9
    },
    run: (ctx, e) => {
      if (e) ctx.workspace.switchTo(Number(e.key) - 1)
      else ctx.workspace.switchNext()
    }
  },
  {
    id: 'close-workspace',
    label: '워크스페이스 닫기',
    keycap: { mods: '⇧⌘', keys: ['W'] },
    scope: 'workspace',
    identityVar: '--id-claude',
    // ⇧⌘W — close (permanently delete) the whole workspace.
    match: (e) => e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && isKey(e, 'w'),
    run: (ctx) => ctx.workspace.close()
  }
]

/** Commands the layout view owns (its keymap dispatches these + close-workspace). */
export const LAYOUT_COMMANDS: readonly Command[] = COMMANDS.filter((c) => c.scope === 'layout')

/** Commands the App shell owns (⌘N + ⌘1–9). */
export const WORKSPACE_COMMANDS: readonly Command[] = COMMANDS.filter(
  (c) => c.scope === 'workspace'
)

/** Inert layout actions — for a context that only runs workspace-scope commands. */
const NOOP_LAYOUT: LayoutActions = {
  splitVertical: () => undefined,
  splitHorizontal: () => undefined,
  addTab: () => undefined,
  activateTab: () => undefined,
  closeTab: () => undefined,
  moveTab: () => undefined,
  focusPane: () => undefined,
  focusDirection: () => undefined,
  setTabPath: () => undefined,
  cycleTab: () => undefined,
  moveActiveTabToDirection: () => undefined,
  closeActiveTab: () => undefined,
  toggleZoom: () => undefined,
  clearZoom: () => undefined
}

/**
 * A context for running workspace-scope commands (⌘N / ⌘1–9) where there is no
 * layout to drive — the App shell. Layout/pending/keymap fields are inert; only
 * `workspace` is live. Layout commands must not be dispatched against it.
 */
export function workspaceContext(workspace: WorkspaceCommandHandlers): CommandContext {
  return {
    layout: NOOP_LAYOUT,
    setPending: () => undefined,
    focusedPaneId: null,
    toggleKeymap: () => undefined,
    workspace,
    // The App shell owns no layout, so host-area commands (⌃⌘H) are inert here —
    // they're dispatched only by the workspace view, which supplies live handlers.
    hostArea: { open: () => undefined, close: () => undefined }
  }
}

/** Look up a command by its stable id. Throws on an unknown id (programmer error). */
export function commandById(id: CommandId): Command {
  const found = COMMANDS.find((c) => c.id === id)
  if (!found) throw new Error(`unknown command id: ${id}`)
  return found
}

/**
 * Dispatch a keyboard event against `commands`: run the first whose chord
 * matches (consuming the event) and return `true`, else `false` (the event is
 * left untouched so it can fall through to another handler or the surface).
 */
export function dispatchKey(
  e: KeyboardEvent,
  commands: readonly Command[],
  ctx: CommandContext
): boolean {
  for (const command of commands) {
    if (command.match(e)) {
      e.preventDefault()
      e.stopPropagation()
      command.run(ctx, e)
      return true
    }
  }
  return false
}

/**
 * Filter `commands` by a case-insensitive substring of the query, matched
 * against the label (an empty query returns all). Powers the ⌘K palette search.
 */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...commands]
  return commands.filter((c) => c.label.toLowerCase().includes(q))
}
