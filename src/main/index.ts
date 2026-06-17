/**
 * Electron main-process entry. Boots the app, registers IPC contracts, and
 * opens the (static, skeleton) renderer window. No feature behavior is wired.
 */
import { app, BrowserWindow } from 'electron'
import { createWindow } from '@main/window'
import { registerIpc } from '@main/ipc/registerIpc'

app.whenReady().then(() => {
  registerIpc()
  createWindow()

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
