/**
 * Routing IPC (PRD-3). The renderer's terminal web-links click invokes
 * `routing.openUrlOnHost` here; it lands on the same {@link BrowserRouter}
 * method the guest channel uses, so a URL surfaced in a host or container
 * terminal opens identically (AC2.5 / AC3.2). `forwardCallback` (direction B,
 * AC3.3) is out of scope and still throws.
 */
import { ipcMain } from 'electron'
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'
import type { OpenUrlOnHostRequest } from '@shared/ipc'
import type { BrowserRouter } from './BrowserRouter'

export interface RoutingIpcDeps {
  router: BrowserRouter
}

export function registerRoutingIpc({ router }: RoutingIpcDeps): void {
  ipcMain.handle(IpcChannels.routing.openUrlOnHost, (_event, req: OpenUrlOnHostRequest): void => {
    router.openUrlOnHost(req.workspaceId, req.url)
  })
  ipcMain.handle(IpcChannels.routing.forwardCallback, () => {
    throw new NotImplementedError(IpcChannels.routing.forwardCallback)
  })
}
