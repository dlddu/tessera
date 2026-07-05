/**
 * Tracks the live {@link Backend} instance for each of a workspace's areas
 * (PRD-2, AC2.4).
 *
 * A workspace is a collection of areas; every area owns one backend, and every
 * pane/tab in that area spawns against it — so a backend is resolved per
 * *(workspace, area)*, never per workspace alone. Today a workspace has exactly
 * one area (the default, whose backend is the workspace's own), so `create`
 * registers under {@link DEFAULT_AREA_ID}; a container workspace's optional
 * host-only area (AC2.7) will register a second backend here later.
 *
 * The `workspace.create` handler registers a backend; `surface.create` and the
 * file handlers {@link BackendRegistry.resolve} it by the requesting tab's
 * area. Resolving an unregistered area is an explicit error, not a silent
 * fallback — that is what makes "no backend mixing inside an area" (AC2.4) a
 * property of the code rather than a convention. The factory is injected so the
 * registry stays decoupled from how backends are constructed.
 */
import { DEFAULT_AREA_ID } from '@shared/types'
import type { BackendConfig, ContainerBackendConfig, HostBackendConfig } from '@shared/types'
import type { Backend } from './Backend'

export class BackendRegistry {
  /** workspaceId → (areaId → backend). One inner map per live workspace. */
  private readonly workspaces = new Map<string, Map<string, Backend>>()

  /**
   * @param createHost      builds a host backend from its config.
   * @param createContainer builds a container backend from its config (the
   *   workspace id names the underlying machine).
   */
  constructor(
    private readonly createHost: (config: HostBackendConfig) => Backend,
    private readonly createContainer: (
      workspaceId: string,
      config: ContainerBackendConfig
    ) => Backend
  ) {}

  /**
   * Construct + register the workspace's default-area backend, returning it.
   * This only builds and tracks the object — it does NOT start it; the caller
   * (create handler) drives {@link Backend.start}, while boot restore
   * re-registers without starting. Both create paths pass through here, so the
   * default area is always covered.
   */
  create(workspaceId: string, config: BackendConfig): Backend {
    const backend =
      config.kind === 'container'
        ? this.createContainer(workspaceId, config)
        : this.createHost(config)
    const areas = this.workspaces.get(workspaceId) ?? new Map<string, Backend>()
    areas.set(DEFAULT_AREA_ID, backend)
    this.workspaces.set(workspaceId, areas)
    return backend
  }

  /**
   * The backend a `(workspace, area)` pair runs against. Throws when the
   * workspace has no registered backend, or when the area is unknown within it —
   * an unmapped area must never quietly borrow another area's backend (AC2.4).
   */
  resolve(workspaceId: string, areaId: string): Backend {
    const areas = this.workspaces.get(workspaceId)
    if (!areas) {
      throw new Error(`no backend for workspace ${workspaceId}`)
    }
    const backend = areas.get(areaId)
    if (!backend) {
      throw new Error(`no backend for area ${areaId} in workspace ${workspaceId}`)
    }
    return backend
  }

  /** Drop the whole workspace — every area's backend — on close/rollback. */
  delete(workspaceId: string): void {
    this.workspaces.delete(workspaceId)
  }
}
