/**
 * Electron main-process entry. Boots the app, registers IPC contracts, restores
 * persisted workspaces' backends (J1-S6), and opens the renderer window.
 */
import { app, BrowserWindow } from 'electron'
import { createWindow } from '@main/window'
import { registerIpc } from '@main/ipc/registerIpc'
import type { BackendRegistry } from '@main/backend'
import type { PersistenceStore } from '@main/persistence'
import { initUpdater } from '@main/update'

/**
 * Re-register each persisted workspace's host backend so its surfaces can spawn
 * on restore (J1-S6). Every workspace is registered up front — the active one
 * goes live as soon as the renderer mounts it; inactive workspaces are
 * registered but idle (no surfaces/PTYs) until activated (S8). A workspace whose
 * cwd has vanished is skipped so one bad entry can't break boot.
 */
async function restoreBackends(store: PersistenceStore, backends: BackendRegistry): Promise<void> {
  for (const snapshot of await store.list()) {
    const { id, backend } = snapshot.workspace
    if (backend.kind !== 'host') continue // only host is re-registerable today
    try {
      backends.create(id, backend.cwd)
    } catch {
      // A missing cwd shouldn't abort startup; its surfaces will report the
      // failure on demand.
    }
  }
}

app.whenReady().then(async () => {
  const { backends, store } = registerIpc()
  // Re-register backends before the window loads so the renderer's first
  // `surface.create` (e.g. the active workspace's terminal) finds its backend.
  await restoreBackends(store, backends)

  const win = createWindow()
  initUpdater(win)

  app.on('activate', () => {
    // macOS: re-open a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // macOS apps typically stay active until the user quits explicitly.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
