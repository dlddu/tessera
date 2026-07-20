/**
 * Live browser-view IPC (PRD-3, AC3.1). Wires the renderer's browser-tab chrome
 * to its host {@link BrowserViewRegistry}: create the view, track it to the pane
 * body (`setBounds`), navigate it (`loadUrl`/`navigate`), and dispose it. The
 * registry pushes `browser.state` back for the address bar + nav buttons.
 *
 * Registered from `main/index.ts` once the window exists (like the updater),
 * because a browser view is parented to the window's content view.
 */
import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type {
  CreateBrowserViewRequest,
  CreateBrowserViewResult,
  DisposeBrowserViewRequest,
  LoadBrowserUrlRequest,
  NavigateBrowserRequest,
  SetBrowserBoundsRequest
} from '@shared/ipc'
import type { BrowserViewRegistry } from './BrowserViewRegistry'

export function registerBrowserIpc(registry: BrowserViewRegistry): void {
  ipcMain.handle(
    IpcChannels.browser.create,
    (_event, req: CreateBrowserViewRequest): CreateBrowserViewResult => ({
      viewId: registry.create(req.tabId, req.url)
    })
  )

  ipcMain.on(IpcChannels.browser.setBounds, (_event, req: SetBrowserBoundsRequest) => {
    registry.setBounds(req.viewId, req.bounds, req.visible)
  })

  ipcMain.on(IpcChannels.browser.loadUrl, (_event, req: LoadBrowserUrlRequest) => {
    registry.loadUrl(req.viewId, req.url)
  })

  ipcMain.on(IpcChannels.browser.navigate, (_event, req: NavigateBrowserRequest) => {
    registry.navigate(req.viewId, req.action)
  })

  ipcMain.handle(IpcChannels.browser.dispose, (_event, req: DisposeBrowserViewRequest): void => {
    registry.dispose(req.viewId)
  })
}
