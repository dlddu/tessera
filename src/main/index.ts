/**
 * Electron main-process entry. Boots the app, registers IPC contracts, restores
 * persisted workspaces' backends (J1-S6), and opens the renderer window.
 */
import { app, BrowserWindow, WebContentsView } from 'electron'
import { createWindow } from '@main/window'
import { fixMainProcessPath } from '@main/env/fixPath'
import { registerIpc } from '@main/ipc/registerIpc'
import type { BackendRegistry } from '@main/backend'
import type { PersistenceStore } from '@main/persistence'
import { BrowserViewRegistry, registerBrowserIpc } from '@main/surface'
import type { ManagedView, ViewParent } from '@main/surface'
import { initUpdater } from '@main/update'
import {
  attachWindowDiagnostics,
  installDiagnostics,
  log,
  logResolvedPath
} from '@main/diagnostics'

// First thing in the process: install the log file + crash handlers, so a
// failure anywhere below this line leaves a trace in a packaged build.
installDiagnostics()

// Reflect the login-shell PATH before anything spawns a child process, so the
// `container` CLI + node-pty shells resolve even when macOS launched us from
// Finder or an auto-update relaunch with a stripped PATH (see fixPath.ts).
fixMainProcessPath()
logResolvedPath()

/**
 * Re-register each persisted workspace's backend so its surfaces can spawn on
 * restore (J1-S6). Every workspace is registered up front — the active one goes
 * live as soon as the renderer mounts it; inactive workspaces are registered but
 * idle (no surfaces/PTYs) until activated (S8).
 *
 * Restore only RE-CONSTRUCTS the backend object; it never calls `start`. A host
 * backend is live from construction. A container backend's object points at its
 * already-created, persistent machine — it isn't rebooted here (that happens on
 * first use in S2). A bad entry is skipped so one can't break boot.
 */
async function restoreBackends(store: PersistenceStore, backends: BackendRegistry): Promise<void> {
  for (const snapshot of await store.list()) {
    const { id, backend } = snapshot.workspace
    try {
      backends.create(id, backend)
    } catch (error) {
      // A bad entry (e.g. a missing host cwd) shouldn't abort startup; its
      // surfaces will report the failure on demand. But swallowing it silently
      // is how "that workspace just doesn't work" becomes untraceable — the
      // user sees a dead workspace and the app knows why, so say so.
      log.scope('restore').warn('backend restore failed; workspace will be inert', {
        workspaceId: id,
        backendKind: backend.kind,
        error: String(error)
      })
    }
  }
}

app.whenReady().then(async () => {
  const { backends, store, router } = registerIpc()
  // Re-register backends before the window loads so the renderer's first
  // `surface.create` (e.g. the active workspace's terminal) finds its backend.
  await restoreBackends(store, backends)

  const win = createWindow()
  // Before the renderer loads, so a first-load failure (bad bundle path, throwing
  // preload) is still captured rather than showing a silent blank window.
  attachWindowDiagnostics(win)
  initUpdater(win)

  // Wire the browser router's main → renderer sink to the window, so a routed
  // URL (guest shim or web-links) opens a new browser tab (direction A, AC3.2).
  router.setEmitter((channel, payload) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  })
  app.once('before-quit', () => router.closeAll())

  // Live browser views (AC3.1): each browser tab's page is a host
  // `WebContentsView` parented to the window's content view. The renderer drives
  // its chrome + position; the registry streams navigation state back. Untrusted
  // web content, so the view runs isolated + sandboxed with no node integration;
  // it uses the default session, so a host login (J3-S3) is reused.
  const browserViews = new BrowserViewRegistry(
    win.contentView as unknown as ViewParent,
    () =>
      new WebContentsView({
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
      }) as unknown as ManagedView,
    (channel, payload) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }
  )
  registerBrowserIpc(browserViews)
  app.once('before-quit', () => browserViews.disposeAll())

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
