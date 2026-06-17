/**
 * Cross-isolation browser routing (PRD-3). The browser surface always runs on
 * the host (AC3.1); this bridges container→host URL opens and host→container
 * callback forwarding.
 *
 * Skeleton stub — both directions throw.
 *   - openUrlOnHost   → direction A: container `xdg-open`/`$BROWSER` → host tab (AC3.2)
 *   - forwardCallback → direction B: forward localhost:CB host→container (AC3.3)
 * Routing must stay isolated per workspace/container (AC3.5).
 */
import { NotImplementedError } from '@shared/errors'

export class BrowserRouter {
  /** Direction A — open a container-originated URL in the host browser surface. */
  openUrlOnHost(_workspaceId: string, _url: string): Promise<void> {
    throw new NotImplementedError('BrowserRouter.openUrlOnHost (direction A)')
  }

  /** Direction B — forward an OAuth localhost callback port host→container. */
  forwardCallback(_workspaceId: string, _port: number): Promise<number> {
    throw new NotImplementedError('BrowserRouter.forwardCallback (direction B)')
  }
}
