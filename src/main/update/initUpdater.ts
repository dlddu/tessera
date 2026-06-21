/**
 * Auto-update wiring (electron-updater → renderer).
 *
 * Mirrors the surface PTY relay: the main process owns the live updater and
 * forwards its lifecycle events to the renderer over the `update` IPC channels,
 * while the renderer drives `check` / `quitAndInstall` back through invoke/send.
 *
 * electron-updater reads the bundled `app-update.yml` (written by electron-builder
 * from the `publish` block) to know which GitHub Release feed to poll. It only
 * works from a signed, packaged build, so everything is gated on `app.isPackaged`:
 * in dev we still register the renderer-facing handlers (so the bridge never
 * rejects) but skip the actual check and event wiring.
 */
import { app, ipcMain, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IpcChannels } from '@shared/ipc'
import type {
  UpdateAvailableEvent,
  UpdateDownloadedEvent,
  UpdateErrorEvent,
  UpdateProgressEvent
} from '@shared/ipc'

export function initUpdater(win: BrowserWindow): void {
  // Accessed lazily (not at module load): the `autoUpdater` getter instantiates
  // the updater and needs Electron's `app`, which is ready by the time we run.
  const { autoUpdater } = electronUpdater

  // renderer → main. Registered unconditionally so the bridge resolves in dev.
  ipcMain.handle(IpcChannels.update.check, async () => {
    if (!app.isPackaged) return
    await autoUpdater.checkForUpdates()
  })
  ipcMain.on(IpcChannels.update.quitAndInstall, () => {
    if (app.isPackaged) autoUpdater.quitAndInstall()
  })

  // No update feed in dev / unpackaged builds — checking would throw.
  if (!app.isPackaged) return

  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('update-available', (info) => {
    send(IpcChannels.update.available, { version: info.version } satisfies UpdateAvailableEvent)
  })
  autoUpdater.on('download-progress', (p) => {
    send(IpcChannels.update.progress, {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond
    } satisfies UpdateProgressEvent)
  })
  autoUpdater.on('update-downloaded', (info) => {
    send(IpcChannels.update.downloaded, { version: info.version } satisfies UpdateDownloadedEvent)
  })
  autoUpdater.on('error', (err) => {
    send(IpcChannels.update.error, {
      message: err instanceof Error ? err.message : String(err)
    } satisfies UpdateErrorEvent)
  })

  void autoUpdater.checkForUpdates()
}
