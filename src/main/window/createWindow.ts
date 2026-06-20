import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

/**
 * Creates the main application window and loads the renderer.
 *
 * Dev: electron-vite injects `ELECTRON_RENDERER_URL` (the Vite dev server).
 * Prod: loads the bundled `out/renderer/index.html`.
 *
 * On macOS we hide the native title bar background (`hiddenInset`) but keep the
 * native traffic lights, then inset them to sit vertically centered in the
 * renderer's 38px design-system title bar. The renderer reserves the space (see
 * `.is-mac .titlebar`) and makes the bar a drag handle (`-webkit-app-region`).
 * Other platforms keep the standard OS frame (their own window controls).
 */
export function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#0D0F14',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // Center 12px lights in the 38px bar: top ≈ (38 - 12) / 2 = 13.
          trafficLightPosition: { x: 12, y: 13 }
        }
      : {}),
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
