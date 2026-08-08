/**
 * Registers backend IPC handlers (PRD-2). `readFile`/`writeFile`/`listDir` are
 * live against the backend of the requesting tab's *area* (host fs AC2.2,
 * container machine fs AC2.3) — resolved by `(workspaceId, areaId)` so every
 * tab in an area hits the same backend (AC2.4). `lifecycle` is live too: it
 * reports and drives the workspace's container machine (AC2.6). The rest
 * (spawnPty, runProcess, getEnv) remain not-implemented stubs that reject with
 * a clear message until their journeys land.
 *
 * File bytes cross IPC as base64 (`dataBase64`) to stay structured-clone-safe.
 */
import { ipcMain } from 'electron'
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'
import type {
  BackendLifecycleRequest,
  ListDirRequest,
  ListDirResult,
  ReadFileRequest,
  ReadFileResult,
  WriteFileRequest
} from '@shared/ipc'
import { DEFAULT_AREA_ID } from '@shared/types'
import type { BackendLifecycleState } from '@shared/types'
import type { BackendRegistry } from './BackendRegistry'

export interface BackendIpcDeps {
  backends: BackendRegistry
}

export function registerBackendIpc({ backends }: BackendIpcDeps): void {
  ipcMain.handle(
    IpcChannels.backend.readFile,
    async (_event, req: ReadFileRequest): Promise<ReadFileResult> => {
      const backend = backends.resolve(req.workspaceId, req.areaId)
      const data = await backend.readFile(req.path)
      return { dataBase64: Buffer.from(data).toString('base64') }
    }
  )

  ipcMain.handle(
    IpcChannels.backend.writeFile,
    async (_event, req: WriteFileRequest): Promise<void> => {
      const backend = backends.resolve(req.workspaceId, req.areaId)
      await backend.writeFile(req.path, Buffer.from(req.dataBase64, 'base64'))
    }
  )

  ipcMain.handle(
    IpcChannels.backend.listDir,
    async (_event, req: ListDirRequest): Promise<ListDirResult> => {
      const backend = backends.resolve(req.workspaceId, req.areaId)
      return { entries: await backend.listDir(req.path) }
    }
  )

  /**
   * Container lifecycle + status (AC2.6). Always resolves the workspace's
   * *default* area backend: lifecycle is a property of the workspace's own
   * backend, and a container workspace's optional host area (AC2.7) is a second
   * backend that has no machine to manage.
   *
   * A failed action is reported as an `error` state carrying the backend's
   * message rather than rejecting, so the panel can render what went wrong
   * (e.g. "Apple `container` CLI를 찾을 수 없습니다") next to a still-usable
   * control instead of surfacing a raw IPC rejection. The status returned is
   * always read back off the backend afterwards, so it reflects the transition
   * that actually happened.
   */
  ipcMain.handle(
    IpcChannels.backend.lifecycle,
    async (_event, req: BackendLifecycleRequest): Promise<BackendLifecycleState> => {
      const backend = backends.resolve(req.workspaceId, DEFAULT_AREA_ID)
      const action = req.action ?? 'status'
      if (action === 'status') return { status: backend.status }
      try {
        if (action === 'stop') await backend.stop()
        else if (action === 'restart') await backend.restart()
        else await backend.remove()
        return { status: backend.status }
      } catch (error) {
        return {
          status: backend.status,
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle(IpcChannels.backend.spawnPty, () => {
    throw new NotImplementedError(IpcChannels.backend.spawnPty)
  })
  ipcMain.handle(IpcChannels.backend.runProcess, () => {
    throw new NotImplementedError(IpcChannels.backend.runProcess)
  })
  ipcMain.handle(IpcChannels.backend.getEnv, () => {
    throw new NotImplementedError(IpcChannels.backend.getEnv)
  })
}
