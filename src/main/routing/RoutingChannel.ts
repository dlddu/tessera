/**
 * Guest → host routing channel (direction A, AC3.2 / AC3.5).
 *
 * One TCP listener per container workspace. The guest's `xdg-open`/`open`/
 * `$BROWSER` shim (installed by {@link ContainerBackend}) dials this listener
 * over the `container` vmnet gateway and posts a single newline-terminated JSON
 * line — `{"token":"…","url":"…"}` — naming the URL to open on the host. The
 * per-workspace `token` is checked on every line: a process that only guessed
 * the port (another container, a stray host process) can't inject a URL without
 * the secret, and each channel maps to exactly one workspace, so opens can never
 * cross-deliver between workspaces (AC3.5).
 *
 * Binding + advertising are split so the spike's finding can be honoured without
 * a code change: the listener binds `0.0.0.0` (so it accepts on the vmnet
 * interface whatever the host's exact VM-facing IP turns out to be) while the
 * guest is told to dial {@link RoutingChannelOptions.advertiseHost} — the gateway
 * (Apple `container`'s vmnet default is `192.168.64.1`). The token is the actual
 * guard; the bind is deliberately permissive so a multi-network / macOS-version
 * quirk in the gateway address can't silently break routing (PRD-3 risk note).
 *
 * URL *scheme* validation is intentionally NOT here — it lives in
 * {@link BrowserRouter.openUrlOnHost}, the single sink the guest channel and the
 * renderer's own `openUrlOnHost` invoke both pass through, so both are filtered
 * identically.
 */
import { createServer, type Server, type Socket } from 'node:net'
import { randomBytes } from 'node:crypto'

/** The endpoint a guest dials to reach a workspace's routing channel. */
export interface RoutingEndpoint {
  /** Address the guest dials — the vmnet gateway (host's VM-facing IP). */
  host: string
  /** OS-assigned listener port. */
  port: number
  /** Per-workspace secret the guest must present on every line (AC3.5). */
  token: string
}

export interface RoutingChannelOptions {
  /** Address to bind the listener to. `0.0.0.0` accepts the vmnet interface. */
  bindHost?: string
  /** Address advertised to the guest (the gateway). Defaults to the vmnet default. */
  advertiseHost?: string
}

/** Accept on every interface — the vmnet one included, whatever the host IP. */
const DEFAULT_BIND_HOST = '0.0.0.0'
/** Apple `container` vmnet gateway default (host's VM-facing address). */
const DEFAULT_ADVERTISE_HOST = '192.168.64.1'
/** Cap one line so a looping / hostile guest can't exhaust host memory. */
const MAX_LINE_BYTES = 8 * 1024
/** Drop a connection that opens but never sends a full line, so it can't linger. */
const IDLE_TIMEOUT_MS = 5000

export class RoutingChannel {
  private server: Server | null = null
  private endpoint: RoutingEndpoint | null = null
  private readonly sockets = new Set<Socket>()

  /**
   * @param onUrl  called with each token-authenticated URL a guest posts. Raw —
   *   scheme validation happens downstream in {@link BrowserRouter}.
   */
  constructor(
    private readonly onUrl: (url: string) => void,
    private readonly options: RoutingChannelOptions = {}
  ) {}

  /** Bind the listener (idempotent) and resolve the endpoint the guest dials. */
  listen(): Promise<RoutingEndpoint> {
    if (this.endpoint) return Promise.resolve(this.endpoint)
    const token = randomBytes(16).toString('hex')
    const bindHost = this.options.bindHost ?? DEFAULT_BIND_HOST
    const advertiseHost = this.options.advertiseHost ?? DEFAULT_ADVERTISE_HOST
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => this.handleConnection(socket, token))
      // A bind failure (port/permission) rejects the listen; the router evicts
      // the channel so a later spawn can retry rather than reuse a dead one.
      server.once('error', reject)
      server.listen(0, bindHost, () => {
        server.removeListener('error', reject)
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        this.server = server
        this.endpoint = { host: advertiseHost, port, token }
        resolve(this.endpoint)
      })
    })
  }

  /** The bound endpoint, or null before {@link RoutingChannel.listen} resolves. */
  get endpointInfo(): RoutingEndpoint | null {
    return this.endpoint
  }

  private handleConnection(socket: Socket, token: string): void {
    this.sockets.add(socket)
    socket.setEncoding('utf8')
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy())
    let buffer = ''
    socket.on('data', (chunk: string) => {
      buffer += chunk
      const nl = buffer.indexOf('\n')
      if (nl >= 0) {
        this.handleLine(buffer.slice(0, nl), token)
        // One URL per connection — half-close so a client that waits for the
        // server (plain `nc` without `-N`) gets EOF and exits promptly.
        socket.end()
      } else if (buffer.length > MAX_LINE_BYTES) {
        socket.destroy()
      }
    })
    socket.on('error', () => socket.destroy())
    socket.on('close', () => this.sockets.delete(socket))
  }

  private handleLine(line: string, token: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return // not a JSON line — ignore
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const message = parsed as { token?: unknown; url?: unknown }
    // Wrong / missing token → drop silently: only this workspace's guest, which
    // was handed the secret via `--env`, can trigger an open (AC3.5).
    if (message.token !== token) return
    if (typeof message.url !== 'string' || message.url.length === 0) return
    this.onUrl(message.url)
  }

  /** Close the listener and drop every open connection. */
  close(): void {
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    this.server?.close()
    this.server = null
    this.endpoint = null
  }
}
