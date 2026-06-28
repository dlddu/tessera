/**
 * Aggregates every IPC handler registration. Called once during app startup.
 *
 * Wires the shared singletons that span handlers: a {@link BackendRegistry}
 * (workspace → live backend, populated by `workspace.create` and boot restore),
 * a {@link SurfaceRegistry} (surface → live PTY, populated by `surface.create`),
 * and one {@link PersistenceStore} shared by the workspace create path and the
 * persistence IPC so saves and loads hit the same files. Returns them so the
 * main entry can drive boot restore (J1-S6).
 */
import { app } from 'electron'
import { BackendRegistry, HostBackend, registerBackendIpc } from '@main/backend'
import { SurfaceRegistry, registerSurfaceIpc } from '@main/surface'
import { registerWorkspaceIpc } from '@main/workspace'
import { registerRoutingIpc } from '@main/routing'
import { PersistenceStore, registerPersistenceIpc } from '@main/persistence'

export interface MainServices {
  backends: BackendRegistry
  surfaces: SurfaceRegistry
  store: PersistenceStore
}

export function registerIpc(): MainServices {
  const backends = new BackendRegistry((cwd) => new HostBackend({ cwd }))
  const surfaces = new SurfaceRegistry()
  const store = new PersistenceStore(app.getPath('userData'))

  registerBackendIpc({ backends })
  registerWorkspaceIpc({ backends, store })
  registerSurfaceIpc({ backends, surfaces })
  registerRoutingIpc()
  registerPersistenceIpc({ store })

  return { backends, surfaces, store }
}
