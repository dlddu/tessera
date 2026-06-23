/**
 * Live window/pane/tab layout engine (PRD-1, AC1.2/AC1.5).
 *
 * Owns one workspace's layout as an immutable {@link LayoutSnapshot} and exposes
 * the mutations the shell drives: split (AC1.2), add/close/move tabs (AC1.1),
 * resize, focus (by id + directional), and serialize/restore (AC1.5). Every
 * mutation produces a brand-new snapshot object and notifies subscribers, so it
 * plugs straight into React via `useSyncExternalStore` (see `useLayout`).
 *
 * The tree transforms are pure functions over {@link LayoutNode}; the class is a
 * thin stateful shell around them. Directional focus + tab move ship as engine
 * methods (with tests) ahead of their S5 interaction UI.
 */
import type {
  LayoutNode,
  LayoutSnapshot,
  PaneNode,
  SplitDirection,
  SplitNode,
  SurfaceKind,
  TabNode
} from '@shared/types'

export type FocusDirection = 'left' | 'right' | 'up' | 'down'

/** Direction for cycling the active tab within a pane (S5 keyboard). */
export type TabCycle = 'next' | 'prev'

/** Direction for nudging the active tab within its pane (S5 keyboard). */
export type TabNudge = 'left' | 'right'

/** Normalized [0,1] rectangle of a pane within the workspace surface. */
export interface PaneRect {
  x: number
  y: number
  w: number
  h: number
}

/* ------------------------------------------------------------------ helpers */

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

/** Last path segment, tolerant of trailing slashes and either separator. */
export function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

/** Parent directory of a path (everything before the last separator). */
export function dirname(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx > 0 ? trimmed.slice(0, idx) : idx === 0 ? trimmed.slice(0, 1) : ''
}

/** A fresh, empty tab of the given surface kind in the given area. */
function makeTab(surface: SurfaceKind, areaId: string): TabNode {
  return { id: uid('tab'), title: defaultTitle(surface), surface, areaId }
}

function defaultTitle(surface: SurfaceKind): string {
  switch (surface) {
    case 'terminal':
      return 'zsh'
    case 'editor':
      return 'untitled'
    case 'browser':
      return 'Browser'
    case 'claude':
      return 'Claude Code'
  }
}

/** Scale a list of sizes so they sum to 1 (falls back to an equal split). */
function normalize(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0)
  if (total <= 0) {
    return sizes.map(() => 1 / sizes.length)
  }
  return sizes.map((s) => s / total)
}

function findPane(node: LayoutNode, paneId: string): PaneNode | null {
  if (node.type === 'pane') {
    return node.id === paneId ? node : null
  }
  for (const child of node.children) {
    const found = findPane(child, paneId)
    if (found) return found
  }
  return null
}

function findTabPane(node: LayoutNode, tabId: string): PaneNode | null {
  if (node.type === 'pane') {
    return node.tabs.some((t) => t.id === tabId) ? node : null
  }
  for (const child of node.children) {
    const found = findTabPane(child, tabId)
    if (found) return found
  }
  return null
}

/** First pane encountered in pre-order — used to re-home focus after removal. */
function firstPane(node: LayoutNode): PaneNode | null {
  if (node.type === 'pane') return node
  for (const child of node.children) {
    const found = firstPane(child)
    if (found) return found
  }
  return null
}

/** Replace the pane `paneId` with `replacement`, structurally cloning the path. */
function replacePane(node: LayoutNode, paneId: string, replacement: LayoutNode): LayoutNode {
  if (node.type === 'pane') {
    return node.id === paneId ? replacement : node
  }
  return { ...node, children: node.children.map((c) => replacePane(c, paneId, replacement)) }
}

/** Apply `fn` to the pane `paneId`, leaving the rest of the tree untouched. */
function updatePane(
  node: LayoutNode,
  paneId: string,
  fn: (pane: PaneNode) => PaneNode
): LayoutNode {
  if (node.type === 'pane') {
    return node.id === paneId ? fn(node) : node
  }
  return { ...node, children: node.children.map((c) => updatePane(c, paneId, fn)) }
}

/** Apply `fn` to whichever pane owns `tabId`. */
function updateTab(node: LayoutNode, tabId: string, fn: (tab: TabNode) => TabNode): LayoutNode {
  if (node.type === 'pane') {
    if (!node.tabs.some((t) => t.id === tabId)) return node
    return { ...node, tabs: node.tabs.map((t) => (t.id === tabId ? fn(t) : t)) }
  }
  return { ...node, children: node.children.map((c) => updateTab(c, tabId, fn)) }
}

/** Apply `fn` to the split `splitId`. */
function updateSplit(
  node: LayoutNode,
  splitId: string,
  fn: (split: SplitNode) => SplitNode
): LayoutNode {
  if (node.type === 'pane') return node
  const self = node.id === splitId ? fn(node) : node
  return { ...self, children: self.children.map((c) => updateSplit(c, splitId, fn)) }
}

/**
 * Remove the pane `paneId`. Splits left with a single child collapse into that
 * child; surviving siblings keep their relative sizes (renormalized). Returns
 * `null` if the whole tree drained (the caller guards against that).
 */
function removePane(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.type === 'pane') {
    return node.id === paneId ? null : node
  }
  const kept: LayoutNode[] = []
  const keptSizes: number[] = []
  node.children.forEach((child, i) => {
    const result = removePane(child, paneId)
    if (result !== null) {
      kept.push(result)
      keptSizes.push(node.sizes[i] ?? 1)
    }
  })
  if (kept.length === 0) return null
  if (kept.length === 1) return kept[0]!
  return { ...node, children: kept, sizes: normalize(keptSizes) }
}

/** Map every pane to its normalized rectangle (used by directional focus). */
function paneRects(node: LayoutNode, rect: PaneRect, acc: Map<string, PaneRect>): void {
  if (node.type === 'pane') {
    acc.set(node.id, rect)
    return
  }
  const fractions = normalize(node.children.map((_, i) => node.sizes[i] ?? 1))
  let offset = 0
  node.children.forEach((child, i) => {
    const frac = fractions[i] ?? 0
    const childRect: PaneRect =
      node.direction === 'vertical'
        ? { x: rect.x + offset * rect.w, y: rect.y, w: frac * rect.w, h: rect.h }
        : { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: frac * rect.h }
    offset += frac
    paneRects(child, childRect, acc)
  })
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0)
}

/** Nearest pane in `dir` that overlaps the current pane on the cross axis. */
function nearestInDirection(
  curId: string,
  rects: Map<string, PaneRect>,
  dir: FocusDirection
): string | null {
  const cur = rects.get(curId)
  if (!cur) return null
  let best: string | null = null
  let bestScore = Infinity
  for (const [id, r] of rects) {
    if (id === curId) continue
    let gap: number
    let cross: number
    if (dir === 'right') {
      gap = r.x - (cur.x + cur.w)
      cross = overlap(cur.y, cur.y + cur.h, r.y, r.y + r.h)
      if (r.x + r.w <= cur.x + cur.w) continue
    } else if (dir === 'left') {
      gap = cur.x - (r.x + r.w)
      cross = overlap(cur.y, cur.y + cur.h, r.y, r.y + r.h)
      if (r.x >= cur.x) continue
    } else if (dir === 'down') {
      gap = r.y - (cur.y + cur.h)
      cross = overlap(cur.x, cur.x + cur.w, r.x, r.x + r.w)
      if (r.y + r.h <= cur.y + cur.h) continue
    } else {
      gap = cur.y - (r.y + r.h)
      cross = overlap(cur.x, cur.x + cur.w, r.x, r.x + r.w)
      if (r.y >= cur.y) continue
    }
    if (cross <= 0) continue
    // Prefer the closest edge; break ties toward the most overlap.
    const score = Math.abs(gap) - cross * 1e-3
    if (score < bestScore) {
      bestScore = score
      best = id
    }
  }
  return best
}

/* ------------------------------------------------------------------- engine */

export class LayoutEngine {
  private snapshot: LayoutSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(initial: LayoutSnapshot) {
    this.snapshot = initial
  }

  /** Subscribe to layout changes (stable ref for `useSyncExternalStore`). */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Current snapshot (stable ref for `useSyncExternalStore`). */
  getSnapshot = (): LayoutSnapshot => this.snapshot

  /** Capture the current window/pane/tab skeleton. AC1.5. */
  serialize(): LayoutSnapshot {
    return this.snapshot
  }

  /** Rebuild the layout from a serialized snapshot. AC1.5. */
  restore(snapshot: LayoutSnapshot): void {
    this.commit(snapshot)
  }

  get focusedPaneId(): string | null {
    return this.snapshot.focusedPaneId
  }

  private commit(next: LayoutSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) {
      listener()
    }
  }

  /**
   * Split `paneId` along `direction`, placing a new pane (holding one `surface`
   * tab) after it and focusing it. AC1.2. Returns the new pane's id, or `null`
   * if the pane doesn't exist.
   */
  split(paneId: string, direction: SplitDirection, surface: SurfaceKind): string | null {
    const pane = findPane(this.snapshot.root, paneId)
    if (!pane) return null

    const areaId = pane.tabs[0]?.areaId ?? this.snapshot.areas[0]?.id ?? 'area-default'
    const tab = makeTab(surface, areaId)
    const newPane: PaneNode = { type: 'pane', id: uid('pane'), tabs: [tab], activeTabId: tab.id }
    const split: SplitNode = {
      type: 'split',
      id: uid('split'),
      direction,
      sizes: [0.5, 0.5],
      children: [pane, newPane]
    }
    const root = replacePane(this.snapshot.root, paneId, split)
    this.commit({ ...this.snapshot, root, focusedPaneId: newPane.id })
    return newPane.id
  }

  /** Vertical split → new pane to the right (P-split-v). */
  splitVertical(paneId: string, surface: SurfaceKind): string | null {
    return this.split(paneId, 'vertical', surface)
  }

  /** Horizontal split → new pane below. */
  splitHorizontal(paneId: string, surface: SurfaceKind): string | null {
    return this.split(paneId, 'horizontal', surface)
  }

  /** Append a tab of `surface` to `paneId` and activate it. AC1.1. */
  addTab(paneId: string, surface: SurfaceKind): string | null {
    const pane = findPane(this.snapshot.root, paneId)
    if (!pane) return null
    const areaId = pane.tabs[0]?.areaId ?? this.snapshot.areas[0]?.id ?? 'area-default'
    const tab = makeTab(surface, areaId)
    const root = updatePane(this.snapshot.root, paneId, (p) => ({
      ...p,
      tabs: [...p.tabs, tab],
      activeTabId: tab.id
    }))
    this.commit({ ...this.snapshot, root })
    return tab.id
  }

  /** Make `tabId` the active tab of `paneId` and focus that pane. */
  activateTab(paneId: string, tabId: string): void {
    const root = updatePane(this.snapshot.root, paneId, (p) =>
      p.tabs.some((t) => t.id === tabId) ? { ...p, activeTabId: tabId } : p
    )
    this.commit({ ...this.snapshot, root, focusedPaneId: paneId })
  }

  /**
   * Close `tabId`. The pane re-homes its active tab to a neighbor; closing the
   * last tab removes the pane and collapses its split. Closing the very last
   * tab of the very last pane is a no-op (a workspace always shows one surface).
   */
  closeTab(tabId: string): void {
    const pane = findTabPane(this.snapshot.root, tabId)
    if (!pane) return

    const index = pane.tabs.findIndex((t) => t.id === tabId)
    const remaining = pane.tabs.filter((t) => t.id !== tabId)

    if (remaining.length > 0) {
      const nextActive =
        pane.activeTabId === tabId
          ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
          : pane.activeTabId
      const root = updatePane(this.snapshot.root, pane.id, (p) => ({
        ...p,
        tabs: remaining,
        activeTabId: nextActive
      }))
      this.commit({ ...this.snapshot, root })
      return
    }

    const root = removePane(this.snapshot.root, pane.id)
    if (root === null) return // last pane standing — keep it
    const focusedPaneId =
      this.snapshot.focusedPaneId === pane.id
        ? (firstPane(root)?.id ?? null)
        : this.snapshot.focusedPaneId
    this.commit({ ...this.snapshot, root, focusedPaneId })
  }

  /**
   * Move `tabId` to `targetPaneId` at `index` (default: end), activating it.
   * Same-pane moves reorder; cross-pane moves drain (and collapse) the source.
   */
  moveTab(tabId: string, targetPaneId: string, index?: number): void {
    const source = findTabPane(this.snapshot.root, tabId)
    const target = findPane(this.snapshot.root, targetPaneId)
    if (!source || !target) return
    const tab = source.tabs.find((t) => t.id === tabId)
    if (!tab) return

    if (source.id === targetPaneId) {
      const without = source.tabs.filter((t) => t.id !== tabId)
      const at = clampIndex(index, without.length)
      const tabs = [...without.slice(0, at), tab, ...without.slice(at)]
      const root = updatePane(this.snapshot.root, source.id, (p) => ({
        ...p,
        tabs,
        activeTabId: tabId
      }))
      this.commit({ ...this.snapshot, root, focusedPaneId: source.id })
      return
    }

    const at = clampIndex(index, target.tabs.length)
    let root = updatePane(this.snapshot.root, targetPaneId, (p) => ({
      ...p,
      tabs: [...p.tabs.slice(0, at), tab, ...p.tabs.slice(at)],
      activeTabId: tabId
    }))

    const sourceRemaining = source.tabs.filter((t) => t.id !== tabId)
    if (sourceRemaining.length > 0) {
      const nextActive =
        source.activeTabId === tabId ? (sourceRemaining[0]?.id ?? null) : source.activeTabId
      root = updatePane(root, source.id, (p) => ({
        ...p,
        tabs: sourceRemaining,
        activeTabId: nextActive
      }))
    } else {
      root = removePane(root, source.id) ?? root
    }
    this.commit({ ...this.snapshot, root, focusedPaneId: targetPaneId })
  }

  /** Reorder `tabId` to `index` within `paneId`. */
  reorderTab(paneId: string, tabId: string, index: number): void {
    this.moveTab(tabId, paneId, index)
  }

  /** Set the file path of an editor `tabId`, retitling it to the basename. */
  setTabPath(tabId: string, path: string): void {
    const root = updateTab(this.snapshot.root, tabId, (t) => ({
      ...t,
      path,
      title: basename(path)
    }))
    this.commit({ ...this.snapshot, root })
  }

  /** Set the child size ratios of `splitId` (renormalized to sum to 1). */
  resize(splitId: string, sizes: number[]): void {
    const root = updateSplit(this.snapshot.root, splitId, (s) =>
      s.children.length === sizes.length ? { ...s, sizes: normalize(sizes) } : s
    )
    this.commit({ ...this.snapshot, root })
  }

  /** Focus a pane by id (click-to-focus). */
  focusPane(paneId: string): void {
    if (this.snapshot.focusedPaneId === paneId) return
    if (!findPane(this.snapshot.root, paneId)) return
    this.commit({ ...this.snapshot, focusedPaneId: paneId })
  }

  /** Move focus to the nearest pane in `dir` (keyboard focus, AC1.4). */
  focusDirection(dir: FocusDirection): void {
    const next = this.paneInDirection(dir)
    if (next) {
      this.commit({ ...this.snapshot, focusedPaneId: next })
    }
  }

  /**
   * The nearest pane to the focused one in `dir` (geometric, cross-axis
   * overlap). Pure query — the basis for both directional focus and cross-pane
   * tab moves (AC1.4). Returns `null` if there's no focus or no pane that way.
   */
  paneInDirection(dir: FocusDirection): string | null {
    const current = this.snapshot.focusedPaneId
    if (!current) return null
    const rects = new Map<string, PaneRect>()
    paneRects(this.snapshot.root, { x: 0, y: 0, w: 1, h: 1 }, rects)
    return nearestInDirection(current, rects, dir)
  }

  /**
   * Activate the next/prev tab of the focused pane, wrapping around (⌃Tab /
   * ⌃⇧Tab, AC1.4). No-op without a focus or with fewer than two tabs.
   */
  cycleTab(dir: TabCycle): void {
    const pane = this.focusedPane()
    if (!pane || pane.tabs.length < 2) return
    const activeId = pane.activeTabId ?? pane.tabs[0]!.id
    const i = pane.tabs.findIndex((t) => t.id === activeId)
    const n = pane.tabs.length
    const j = dir === 'next' ? (i + 1) % n : (i - 1 + n) % n
    this.activateTab(pane.id, pane.tabs[j]!.id)
  }

  /**
   * Reorder the focused pane's active tab one slot left/right (⇧⌘[ / ⇧⌘],
   * AC1.4). No-op at the ends, or without a focused active tab.
   */
  nudgeActiveTab(dir: TabNudge): void {
    const pane = this.focusedPane()
    if (!pane || !pane.activeTabId || pane.tabs.length < 2) return
    const i = pane.tabs.findIndex((t) => t.id === pane.activeTabId)
    if (i < 0) return
    const target = dir === 'left' ? i - 1 : i + 1
    if (target < 0 || target >= pane.tabs.length) return
    this.moveTab(pane.activeTabId, pane.id, target)
  }

  /**
   * Move the focused pane's active tab to the nearest pane in `dir`
   * (⌃⌘⇧+arrows, AC1.4). No-op if there's no neighbor that way.
   */
  moveActiveTabToDirection(dir: FocusDirection): void {
    const pane = this.focusedPane()
    if (!pane || !pane.activeTabId) return
    const target = this.paneInDirection(dir)
    if (!target || target === pane.id) return
    this.moveTab(pane.activeTabId, target)
  }

  /** Close the focused pane's active tab (⌘W, AC1.4). */
  closeActiveTab(): void {
    const pane = this.focusedPane()
    if (pane?.activeTabId) this.closeTab(pane.activeTabId)
  }

  /** The focused pane node, or `null`. */
  private focusedPane(): PaneNode | null {
    const id = this.snapshot.focusedPaneId
    return id ? findPane(this.snapshot.root, id) : null
  }

  /** Pane rectangles in normalized [0,1] space (geometry for tests / S5). */
  paneRects(): Map<string, PaneRect> {
    const rects = new Map<string, PaneRect>()
    paneRects(this.snapshot.root, { x: 0, y: 0, w: 1, h: 1 }, rects)
    return rects
  }
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length
  return Math.max(0, Math.min(index, length))
}
