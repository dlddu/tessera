import { ipcMain } from 'electron'
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'

export function registerPersistenceIpc(): void {
  ipcMain.handle(IpcChannels.persistence.save, () => {
    throw new NotImplementedError(IpcChannels.persistence.save)
  })
  ipcMain.handle(IpcChannels.persistence.load, () => {
    throw new NotImplementedError(IpcChannels.persistence.load)
  })
}
