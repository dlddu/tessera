/**
 * Aggregates every IPC handler registration. Called once during app startup.
 * Surface lifecycle handlers are registered inline (no dedicated module yet);
 * backend / routing / persistence delegate to their own registrars.
 */
import { ipcMain } from 'electron'
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'
import { registerBackendIpc } from '@main/backend'
import { registerWorkspaceIpc } from '@main/workspace'
import { registerRoutingIpc } from '@main/routing'
import { registerPersistenceIpc } from '@main/persistence'

function registerSurfaceIpc(): void {
  ipcMain.handle(IpcChannels.surface.create, () => {
    throw new NotImplementedError(IpcChannels.surface.create)
  })
  ipcMain.handle(IpcChannels.surface.dispose, () => {
    throw new NotImplementedError(IpcChannels.surface.dispose)
  })
}

export function registerIpc(): void {
  registerBackendIpc()
  registerWorkspaceIpc()
  registerSurfaceIpc()
  registerRoutingIpc()
  registerPersistenceIpc()
}
