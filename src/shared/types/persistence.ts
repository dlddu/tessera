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
 * Current {@link WorkspaceStateSnapshot} schema version. Bumped to 2 when the
 * embedded {@link Workspace} (name + backend cwd) was added so restore can
 * rebuild the workspace and re-register its backend (J1-S6). `load` discards
 * snapshots written under any other version rather than guessing their shape.
 */
export const WORKSPACE_SNAPSHOT_VERSION = 2

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
