/**
 * Registers backend IPC handlers (PRD-2). `readFile`/`writeFile` are live
 * against the workspace's backend (host fs, AC2.2); the rest (spawnPty,
 * runProcess, getEnv, lifecycle) remain not-implemented stubs that reject with a
 * clear message until their journeys land.
 *
 * File bytes cross IPC as base64 (`dataBase64`) to stay structured-clone-safe.
 */
import { ipcMain } from 'electron'
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'
import type { ReadFileRequest, ReadFileResult, WriteFileRequest } from '@shared/ipc'
import type { BackendRegistry } from './BackendRegistry'

export interface BackendIpcDeps {
  backends: BackendRegistry
}

export function registerBackendIpc({ backends }: BackendIpcDeps): void {
  ipcMain.handle(
    IpcChannels.backend.readFile,
    async (_event, req: ReadFileRequest): Promise<ReadFileResult> => {
      const backend = backends.get(req.workspaceId)
      if (!backend) {
        throw new Error(`no backend for workspace ${req.workspaceId}`)
      }
      const data = await backend.readFile(req.path)
      return { dataBase64: Buffer.from(data).toString('base64') }
    }
  )

  ipcMain.handle(
    IpcChannels.backend.writeFile,
    async (_event, req: WriteFileRequest): Promise<void> => {
      const backend = backends.get(req.workspaceId)
      if (!backend) {
        throw new Error(`no backend for workspace ${req.workspaceId}`)
      }
      await backend.writeFile(req.path, Buffer.from(req.dataBase64, 'base64'))
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
  ipcMain.handle(IpcChannels.backend.lifecycle, () => {
    throw new NotImplementedError(IpcChannels.backend.lifecycle)
  })
}
