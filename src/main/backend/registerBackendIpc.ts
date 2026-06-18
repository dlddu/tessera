/**
 * Registers backend IPC handlers (PRD-2). Each handler is a not-implemented
 * stub: the channel + payload typing is real, the behavior throws so renderer
 * callers get a clear `not implemented` rejection.
 */
import { ipcMain } from 'electron'
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'

export function registerBackendIpc(): void {
  ipcMain.handle(IpcChannels.backend.spawnPty, () => {
    throw new NotImplementedError(IpcChannels.backend.spawnPty)
  })
  ipcMain.handle(IpcChannels.backend.readFile, () => {
    throw new NotImplementedError(IpcChannels.backend.readFile)
  })
  ipcMain.handle(IpcChannels.backend.writeFile, () => {
    throw new NotImplementedError(IpcChannels.backend.writeFile)
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
