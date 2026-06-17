import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

/**
 * Creates the main application window and loads the renderer.
 *
 * Dev: electron-vite injects `ELECTRON_RENDERER_URL` (the Vite dev server).
 * Prod: loads the bundled `out/renderer/index.html`.
 *
 * Note: the renderer draws its own design-system title bar. Integrating native
 * macOS traffic lights (`titleBarStyle: 'hiddenInset'`) is a next step.
 */
export function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#0D0F14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
