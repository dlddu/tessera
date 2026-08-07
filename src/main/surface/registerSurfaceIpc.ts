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

/**
 * How often to sample a PTY's live foreground-process name for the tab title.
 * node-pty has no change event, so a light poll is the standard approach; 1s is
 * responsive without meaningfully taxing the host per terminal.
 */
const PROCESS_POLL_INTERVAL_MS = 1000

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

      // Resolve the backend of the requesting tab's area — not just its
      // workspace — so every surface in an area spawns against the same backend
      // and an unmapped area is rejected outright (AC2.4).
      const backend = backends.resolve(req.workspaceId, req.areaId)

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

      // Live tab title: poll the PTY's foreground-process name and push it to the
      // renderer whenever it changes, so the tab reads what's actually running
      // (`zsh` → `vim` → `zsh`) instead of a fixed default. Only host PTYs expose
      // `process` (a container PTY is the host-side CLI); others skip the poll and
      // keep their default title. Seeded from `null` so the first tick corrects
      // the tab to the real shell name even when it differs from the default.
      let titlePoll: ReturnType<typeof setInterval> | null = null
      if (pty.process !== undefined) {
        let lastTitle: string | null = null
        titlePoll = setInterval(() => {
          if (sender.isDestroyed()) {
            return
          }
          let name: string | undefined
          try {
            name = pty.process
          } catch {
            // A just-exited PTY can throw on read; the exit handler clears the poll.
            return
          }
          if (name && name !== lastTitle) {
            lastTitle = name
            sender.send(IpcChannels.surface.ptyTitle, { surfaceId, title: name })
          }
        }, PROCESS_POLL_INTERVAL_MS)
      }

      pty.onExit((code, signal) => {
        if (titlePoll) {
          clearInterval(titlePoll)
        }
        if (!sender.isDestroyed()) {
          // Carry the signal through when there is one: the renderer needs it to
          // tell a force-killed backend from a clean `exit` (AC4.3).
          sender.send(IpcChannels.surface.ptyExit, {
            surfaceId,
            code,
            ...(signal !== undefined ? { signal } : {})
          })
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
