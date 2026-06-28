/**
 * Persistence IPC (PRD-4 / J1-S6). Bridges the renderer's restore-state calls to
 * the shared {@link PersistenceStore}: debounced `save`, a synchronous `saveSync`
 * for the app-quit flush, single-workspace `load`, and `list` for boot restore.
 * The store is injected so it's the *same* instance the workspace create path
 * writes through.
 */
import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { LoadStateRequest } from '@shared/ipc'
import type { WorkspaceStateSnapshot } from '@shared/types'
import type { PersistenceStore } from './PersistenceStore'

export interface PersistenceIpcDeps {
  store: PersistenceStore
}

export function registerPersistenceIpc({ store }: PersistenceIpcDeps): void {
  ipcMain.handle(IpcChannels.persistence.save, (_event, snapshot: WorkspaceStateSnapshot) =>
    store.save(snapshot)
  )

  // Synchronous quit flush: the renderer's `beforeunload` uses `sendSync`, so we
  // must write before returning. `returnValue` unblocks the renderer.
  ipcMain.on(IpcChannels.persistence.saveSync, (event, snapshot: WorkspaceStateSnapshot) => {
    store.saveSync(snapshot)
    event.returnValue = true
  })

  ipcMain.handle(IpcChannels.persistence.load, (_event, req: LoadStateRequest) =>
    store.load(req.workspaceId)
  )

  ipcMain.handle(IpcChannels.persistence.list, () => store.list())
}
