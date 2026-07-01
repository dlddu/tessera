/**
 * Surface lifecycle + PTY streaming IPC (M-J1-S2).
 *
 * `surface.create` resolves the workspace's backend, spawns a PTY, registers it
 * under a fresh `surfaceId`, and streams its output to the requesting renderer
 * (`surface.ptyData`) until it exits (`surface.ptyExit`). The renderer drives
 * the live PTY back through `surface.ptyInput` / `surface.ptyResize`, and tears
 * it down with `surface.dispose`. Everything is keyed by `surfaceId`, so the
 * renderer never touches backends or PTY handles directly.
 */
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'
import type {
  CreateSurfaceRequest,
  CreateSurfaceResult,
  DisposeSurfaceRequest,
  PtyInputRequest,
  PtyResizeRequest
} from '@shared/ipc'
import type { BackendRegistry } from '@main/backend'
import { SurfaceRegistry } from './SurfaceRegistry'

/** Initial PTY geometry; the renderer fits + resizes once it has measured. */
const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

export interface SurfaceIpcDeps {
  backends: BackendRegistry
  surfaces?: SurfaceRegistry
}

export function registerSurfaceIpc({
  backends,
  surfaces = new SurfaceRegistry()
}: SurfaceIpcDeps): SurfaceRegistry {
  ipcMain.handle(
    IpcChannels.surface.create,
    async (event, req: CreateSurfaceRequest): Promise<CreateSurfaceResult> => {
      // M-J1-S2 only wires the terminal surface; other kinds land later.
      if (req.surface !== 'terminal') {
        throw new NotImplementedError(`surface.create (${req.surface})`)
      }

      const backend = backends.get(req.workspaceId)
      if (!backend) {
        throw new Error(`no backend for workspace ${req.workspaceId}`)
      }

      // `req.cwd` is only set by container terminals inheriting a sibling's live
      // cwd (M-J2-S2); host terminals leave it undefined and the backend falls
      // back to the workspace cwd.
      const pty = await backend.spawnPty({
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        ...(req.cwd !== undefined ? { cwd: req.cwd } : {})
      })
      const surfaceId = `S-${randomUUID()}`
      surfaces.register(surfaceId, pty)

      const sender = event.sender
      pty.onData((chunk) => {
        if (!sender.isDestroyed()) {
          sender.send(IpcChannels.surface.ptyData, { surfaceId, chunk })
        }
      })
      pty.onExit((code) => {
        if (!sender.isDestroyed()) {
          sender.send(IpcChannels.surface.ptyExit, { surfaceId, code })
        }
        surfaces.delete(surfaceId)
      })

      return { surfaceId }
    }
  )

  ipcMain.handle(IpcChannels.surface.dispose, (_event, req: DisposeSurfaceRequest): void => {
    surfaces.dispose(req.surfaceId)
  })

  ipcMain.on(IpcChannels.surface.ptyInput, (_event, req: PtyInputRequest) => {
    surfaces.get(req.surfaceId)?.write(req.data)
  })

  ipcMain.on(IpcChannels.surface.ptyResize, (_event, req: PtyResizeRequest) => {
    if (req.cols > 0 && req.rows > 0) {
      surfaces.get(req.surfaceId)?.resize(req.cols, req.rows)
    }
  })

  return surfaces
}
