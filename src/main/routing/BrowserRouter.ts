/**
 * Cross-isolation browser routing (PRD-3). The browser surface always runs on
 * the host (AC3.1); this bridges container→host URL opens (direction A) and,
 * later, host→container callback forwarding (direction B).
 *
 * Direction A (implemented) has two entry points that converge here:
 *   1. the guest shim / `$BROWSER` posts a URL to its workspace's
 *      {@link RoutingChannel} (TCP over the vmnet gateway), which calls
 *      {@link BrowserRouter.openUrlOnHost};
 *   2. the renderer's terminal web-links click invokes `routing.openUrlOnHost`
 *      through IPC, landing on the same method.
 * Both validate the scheme once, here, then emit a single `routing.openUrl`
 * event to the renderer, which opens a new host browser tab (AC3.2). Keeping
 * the sink singular is what makes host and container terminals behave
 * identically (AC2.5) and what keeps every open attributed to the right
 * workspace (AC3.5).
 *
 * Direction B (`forwardCallback`, AC3.3) is out of scope here and still throws.
 */
import { NotImplementedError } from '@shared/errors'
import { IpcChannels } from '@shared/ipc'
import type { OpenUrlEvent } from '@shared/ipc'
import { RoutingChannel } from './RoutingChannel'
import type { RoutingChannelOptions, RoutingEndpoint } from './RoutingChannel'

/** Emit a main → renderer event (bound to the app window's webContents). */
export type RoutingEmit = (channel: string, payload: unknown) => void

/**
 * The slice of the router a {@link ContainerBackend} depends on to obtain its
 * guest→host endpoint for `--env` injection — narrow so the backend layer
 * stays decoupled from the full router.
 */
export interface RoutingProvider {
  ensureChannel(workspaceId: string): Promise<RoutingEndpoint>
}

export interface BrowserRouterOptions {
  /** Bind / advertise addresses for each workspace's channel. */
  channel?: RoutingChannelOptions
  /** Channel factory — injected in tests to avoid opening real sockets. */
  createChannel?: (onUrl: (url: string) => void) => RoutingChannel
}

export class BrowserRouter implements RoutingProvider {
  /** workspaceId → its channel + the memoized listen() so opens can't race. */
  private readonly channels = new Map<
    string,
    { channel: RoutingChannel; ready: Promise<RoutingEndpoint> }
  >()
  private emit: RoutingEmit | null = null

  constructor(private readonly options: BrowserRouterOptions = {}) {}

  /** Wire the main → renderer sink once the app window exists. */
  setEmitter(emit: RoutingEmit): void {
    this.emit = emit
  }

  /**
   * Ensure a workspace's guest→host routing channel is listening and resolve the
   * endpoint the guest should dial. Idempotent per workspace (the listen() is
   * memoized); a failed bind is evicted so a later call retries instead of
   * reusing a dead channel.
   */
  ensureChannel(workspaceId: string): Promise<RoutingEndpoint> {
    const existing = this.channels.get(workspaceId)
    if (existing) return existing.ready

    const onUrl = (url: string): void => this.openUrlOnHost(workspaceId, url)
    const channel =
      this.options.createChannel?.(onUrl) ?? new RoutingChannel(onUrl, this.options.channel)
    const ready = channel.listen().catch((error: unknown) => {
      this.channels.delete(workspaceId)
      throw error
    })
    this.channels.set(workspaceId, { channel, ready })
    return ready
  }

  /**
   * Direction A — open a container-originated URL in the host browser surface
   * (AC3.2). Validates the scheme (only `http`/`https` route; a `file:`,
   * `javascript:`, or malformed URL is dropped) and emits `routing.openUrl` so
   * the renderer opens a new browser tab in the workspace's focused pane. A no-op
   * before the emitter is attached (no window yet) — routing has nowhere to land.
   */
  openUrlOnHost(workspaceId: string, url: string): void {
    if (!isRoutableUrl(url)) return
    this.emit?.(IpcChannels.routing.openUrl, { workspaceId, url } satisfies OpenUrlEvent)
  }

  /** Direction B — forward an OAuth localhost callback port host→container. */
  forwardCallback(_workspaceId: string, _port: number): Promise<number> {
    throw new NotImplementedError('BrowserRouter.forwardCallback (direction B)')
  }

  /** Close a workspace's channel (workspace close). Idempotent. */
  closeChannel(workspaceId: string): void {
    this.channels.get(workspaceId)?.channel.close()
    this.channels.delete(workspaceId)
  }

  /** Close every channel (app teardown). */
  closeAll(): void {
    for (const { channel } of this.channels.values()) channel.close()
    this.channels.clear()
  }
}

/** Only real web URLs route; anything else (file:, data:, javascript:) is dropped. */
function isRoutableUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}
