/**
 * Aggregates every IPC handler registration. Called once during app startup.
 *
 * Wires the shared registries that span handlers: a {@link BackendRegistry}
 * (workspace → live backend, populated by `workspace.create`) and a
 * {@link SurfaceRegistry} (surface → live PTY, populated by `surface.create`).
 * Routing / persistence remain not-implemented stubs.
 */
import { BackendRegistry, HostBackend, registerBackendIpc } from '@main/backend'
import { SurfaceRegistry, registerSurfaceIpc } from '@main/surface'
import { registerWorkspaceIpc } from '@main/workspace'
import { registerRoutingIpc } from '@main/routing'
import { registerPersistenceIpc } from '@main/persistence'

export function registerIpc(): void {
  const backends = new BackendRegistry((cwd) => new HostBackend({ cwd }))
  const surfaces = new SurfaceRegistry()

  registerBackendIpc()
  registerWorkspaceIpc({ backends })
  registerSurfaceIpc({ backends, surfaces })
  registerRoutingIpc()
  registerPersistenceIpc()
}
