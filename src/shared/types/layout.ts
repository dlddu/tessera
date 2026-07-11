/**
 * Window / pane / tab layout tree + serialization (PRD-1).
 *
 * - Window = top-level container (a workspace).
 * - Pane = a tiled leaf holding tabs.
 * - Split = a node dividing space among children (nesting supported, AC1.2).
 * - Tab = one component surface (AC1.1), belonging to one area.
 *
 * `LayoutSnapshot` is the serializable layout skeleton (AC1.5). Component
 * *content* restoration (buffers, scrollback, URLs) is layered on top by PRD-4.
 */
import type { BackendKind } from './backend'
import type { SurfaceKind } from './surface'

export type SplitDirection = 'horizontal' | 'vertical'

/**
 * Id of the workspace's default area — the one every workspace is born with,
 * whose backend is the workspace's own (AC2.4). Every pane/tab created without
 * an explicit area inherits this one, so its backend is uniform. The single
 * source of truth for the literal: the factory, the sample layout, and the
 * engine's split/add-tab fallback all reference it (no scattered strings).
 */
export const DEFAULT_AREA_ID = 'area-default'

/** A backend-bounded region within a workspace. AC2.4, AC2.7, #11. */
export interface Area {
  id: string
  /** 'default' = the workspace's own backend; 'host' = the host-only escape area. */
  kind: 'default' | 'host'
  /** Backend the area's panes/tabs inherit. Uniform within an area. */
  backend: BackendKind
}

export interface TabNode {
  id: string
  title: string
  surface: SurfaceKind
  /** The area whose backend/env this tab inherits. AC2.4. */
  areaId: string
  /**
   * For editor tabs: the host path of the open file (AC2.2). Absent until a file
   * is chosen; drives the tab title (basename) and the path breadcrumb. Carried
   * in the snapshot so it survives serialize/restore (PRD-4).
   */
  path?: string
  /**
   * For browser tabs: the tab's current URL (AC3.2). Set when a tab is opened
   * onto a routed URL and updated as the user navigates, so the live view can
   * reload it and (PRD-4, AC4.4) a restored tab reopens where it was. Optional
   * and absent-tolerant — it rides the snapshot as an extra field, so the
   * persistence envelope check and schema version (v3) are unchanged.
   */
  url?: string
}

/** Leaf node: a pane holding an ordered set of tabs. */
export interface PaneNode {
  type: 'pane'
  id: string
  tabs: TabNode[]
  activeTabId: string | null
}

/** Internal node: a split dividing space among its children. */
export interface SplitNode {
  type: 'split'
  id: string
  direction: SplitDirection
  /** Child size ratios, parallel to `children`, summing to ~1. */
  sizes: number[]
  children: LayoutNode[]
}

export type LayoutNode = PaneNode | SplitNode

/** Serializable layout skeleton for one workspace window. AC1.5. */
export interface LayoutSnapshot {
  version: number
  workspaceId: string
  root: LayoutNode
  areas: Area[]
  focusedPaneId: string | null
  /**
   * The pane currently zoomed to fill the whole window, or `null` when none is
   * (AC1.6). Zoom is part of the persisted skeleton — it survives serialize /
   * restore so a workspace reopens in the same zoom state — and it follows
   * focus: while zoom is active this always equals {@link focusedPaneId}.
   */
  zoomedPaneId: string | null
}

/* ---------------------------------------------------- host area restore strip */

/** The area a pane belongs to — its tabs are uniform within an area (AC2.4). */
function paneArea(pane: PaneNode): string | undefined {
  return pane.tabs[0]?.areaId
}

/** Scale a list of sizes to sum to 1 (equal split when they sum to ≤ 0). */
function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0)
  return total > 0 ? sizes.map((s) => s / total) : sizes.map(() => 1 / sizes.length)
}

/** Remove every pane whose area is in `areaIds`, collapsing emptied splits. */
function dropAreaPanes(node: LayoutNode, areaIds: Set<string>): LayoutNode | null {
  if (node.type === 'pane') {
    const area = paneArea(node)
    return area !== undefined && areaIds.has(area) ? null : node
  }
  const kept: LayoutNode[] = []
  const keptSizes: number[] = []
  node.children.forEach((child, i) => {
    const result = dropAreaPanes(child, areaIds)
    if (result !== null) {
      kept.push(result)
      keptSizes.push(node.sizes[i] ?? 1)
    }
  })
  if (kept.length === 0) return null
  if (kept.length === 1) return kept[0]!
  return { ...node, children: kept, sizes: normalizeSizes(keptSizes) }
}

/** First pane id in pre-order, or null for an empty tree. */
function firstPaneId(node: LayoutNode): string | null {
  if (node.type === 'pane') return node.id
  for (const child of node.children) {
    const id = firstPaneId(child)
    if (id) return id
  }
  return null
}

/** True if a pane with `paneId` exists anywhere in the tree. */
function hasPane(node: LayoutNode, paneId: string): boolean {
  if (node.type === 'pane') return node.id === paneId
  return node.children.some((child) => hasPane(child, paneId))
}

/**
 * Return `layout` with every host area removed and the top-level area split
 * collapsed back to the default (container) subtree.
 *
 * Host areas are live-session only (AC2.7): their host backends are registered
 * on open and dropped on close, never re-registered on boot restore — so a
 * restored host subtree would have no backend to spawn its terminals against.
 * Rather than carry that broken state, restore reopens container-only; full
 * host-area restore (re-register + re-spawn) is deferred to J4. Pure and
 * defensive: a garbled layout (missing / non-array `areas`, absent `root`) is
 * returned unchanged so a bad on-disk snapshot can't crash restore.
 */
export function stripHostAreas(layout: LayoutSnapshot): LayoutSnapshot {
  if (!Array.isArray(layout.areas) || layout.root == null) return layout
  const hostAreaIds = new Set(
    layout.areas.filter((area) => area?.kind === 'host').map((area) => area.id)
  )
  if (hostAreaIds.size === 0) return layout

  const root = dropAreaPanes(layout.root, hostAreaIds)
  // The default area always keeps a pane, so the tree should never fully drain;
  // if a corrupt snapshot somehow held only host panes, keep the original rather
  // than produce a rootless layout.
  if (root === null) return layout

  const areas = layout.areas.filter((area) => area?.kind !== 'host')
  const focusedPaneId =
    layout.focusedPaneId && hasPane(root, layout.focusedPaneId)
      ? layout.focusedPaneId
      : firstPaneId(root)
  const zoomedPaneId =
    layout.zoomedPaneId && hasPane(root, layout.zoomedPaneId) ? layout.zoomedPaneId : null
  return { ...layout, root, areas, focusedPaneId, zoomedPaneId }
}
