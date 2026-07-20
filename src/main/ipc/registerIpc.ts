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
import {
  BackendRegistry,
  ContainerBackend,
  HostBackend,
  createCliContainerRuntime,
  registerBackendIpc
} from '@main/backend'
import { SurfaceRegistry, registerSurfaceIpc } from '@main/surface'
import { registerWorkspaceIpc } from '@main/workspace'
import { BrowserRouter, registerRoutingIpc } from '@main/routing'
import { PersistenceStore, registerPersistenceIpc } from '@main/persistence'

export interface MainServices {
  backends: BackendRegistry
  surfaces: SurfaceRegistry
  store: PersistenceStore
  /** Cross-isolation browser router (PRD-3); the window wires its emitter (S1). */
  router: BrowserRouter
}

export function registerIpc(): MainServices {
  // The cross-isolation browser router (PRD-3). It owns each container
  // workspace's guest→host routing channel and is the single sink every routed
  // URL passes through (guest shim + renderer web-links). Its emitter is wired
  // to the window in `main/index.ts` once the window exists.
  const router = new BrowserRouter()

  // One container runtime drives every container machine (CLI-backed; the daemon
  // is started lazily on first use via `ensureSystem`).
  const containerRuntime = createCliContainerRuntime()
  const backends = new BackendRegistry(
    (config) => new HostBackend({ cwd: config.cwd }),
    (workspaceId, config) =>
      new ContainerBackend({
        name: workspaceId,
        image: config.image,
        homeMount: config.homeMount,
        ...(config.cpus !== undefined ? { cpus: config.cpus } : {}),
        ...(config.memory !== undefined ? { memory: config.memory } : {}),
        runtime: containerRuntime,
        // The container's guest shim + `$BROWSER` post routed URLs back through
        // this workspace's channel (direction A, AC3.2).
        routing: router
      })
  )
  const surfaces = new SurfaceRegistry()
  const store = new PersistenceStore(app.getPath('userData'))

  registerBackendIpc({ backends })
  registerWorkspaceIpc({ backends, store, router })
  registerSurfaceIpc({ backends, surfaces })
  registerRoutingIpc({ router })
  registerPersistenceIpc({ store })

  return { backends, surfaces, store, router }
}
