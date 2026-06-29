/**
 * Host-side persisted state for crash resilience (PRD-4).
 *
 * All restore state is written to a host-side store, debounced, independent of
 * backend/app lifetime (AC4.5). Per-surface content payloads are intentionally
 * loose (`unknown`) at the skeleton stage — feature work narrows them per kind.
 */
import type { Workspace } from './backend'
import type { LayoutSnapshot } from './layout'
import type { SurfaceKind } from './surface'

/**
 * Current {@link WorkspaceStateSnapshot} schema version.
 *
 * - v2 embedded the {@link Workspace} (name + backend cwd) so restore can
 *   rebuild the workspace and re-register its backend (J1-S6).
 * - v3 added `layout.zoomedPaneId`: pane zoom (AC1.6) joined the persisted
 *   skeleton so a workspace reopens in the same zoom state (J1-S7).
 *
 * Unlike earlier "exact-version-or-discard" loads, older snapshots are now
 * upgraded by the {@link migrateWorkspaceSnapshot} pipeline before validation;
 * only versions with no migration path (or newer-than-known) are discarded.
 */
export const WORKSPACE_SNAPSHOT_VERSION = 3

/** Last-known content for one surface, keyed by its tab id. */
export interface SurfaceStateEntry {
  tabId: string
  surface: SurfaceKind
  /** Surface-specific payload (editor buffer, terminal screen, browser tabs…). */
  content: unknown
}

/** The full restorable state for one workspace. AC4.1–AC4.5. */
export interface WorkspaceStateSnapshot {
  version: number
  workspaceId: string
  /**
   * The workspace identity (id, name, backend + cwd). Embedded so a cold boot
   * can rebuild the workspace and re-register its host backend without any
   * separate index (J1-S6). Mirrors `CreateWorkspaceResult.workspace`.
   */
  workspace: Workspace
  /** Layout skeleton (AC1.5) the content is restored onto. */
  layout: LayoutSnapshot
  /** Per-surface last-known content. */
  surfaces: SurfaceStateEntry[]
  /** Epoch ms of the last persist. */
  savedAt: number
}

/**
 * Build a persistable snapshot for a workspace's current skeleton, stamping the
 * schema version. Pure (no clock, no IO) so it is shared by the main-process
 * create path and the renderer's autosave without dragging Electron or
 * `node:crypto` into the renderer bundle. Content restore is out of scope here,
 * so `surfaces` is always empty (J4 owns it).
 */
export function buildWorkspaceSnapshot(
  workspace: Workspace,
  layout: LayoutSnapshot,
  savedAt: number
): WorkspaceStateSnapshot {
  return {
    version: WORKSPACE_SNAPSHOT_VERSION,
    workspaceId: workspace.id,
    workspace,
    layout,
    surfaces: [],
    savedAt
  }
}
