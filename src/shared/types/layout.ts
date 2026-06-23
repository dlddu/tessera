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
}
