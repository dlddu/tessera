/**
 * Tracks the live {@link Backend} instance for each workspace (PRD-2).
 *
 * A workspace owns one backend; surfaces (terminals, etc.) created within it
 * spawn against that backend. The `workspace.create` handler registers a
 * backend here; `surface.create` looks it up. The factory is injected so the
 * registry stays decoupled from how backends are constructed (host today,
 * container later).
 */
import type { BackendConfig, ContainerBackendConfig, HostBackendConfig } from '@shared/types'
import type { Backend } from './Backend'

export class BackendRegistry {
  private readonly backends = new Map<string, Backend>()

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
   * Construct + register the backend for a workspace, returning it. This only
   * builds and tracks the object — it does NOT start it; the caller (create
   * handler) drives {@link Backend.start}, while boot restore re-registers
   * without starting.
   */
  create(workspaceId: string, config: BackendConfig): Backend {
    const backend =
      config.kind === 'container'
        ? this.createContainer(workspaceId, config)
        : this.createHost(config)
    this.backends.set(workspaceId, backend)
    return backend
  }

  get(workspaceId: string): Backend | undefined {
    return this.backends.get(workspaceId)
  }

  delete(workspaceId: string): void {
    this.backends.delete(workspaceId)
  }
}
