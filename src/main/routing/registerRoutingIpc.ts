import { ipcMain } from 'electron'
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'

export function registerRoutingIpc(): void {
  ipcMain.handle(IpcChannels.routing.openUrlOnHost, () => {
    throw new NotImplementedError(IpcChannels.routing.openUrlOnHost)
  })
  ipcMain.handle(IpcChannels.routing.forwardCallback, () => {
    throw new NotImplementedError(IpcChannels.routing.forwardCallback)
  })
}
