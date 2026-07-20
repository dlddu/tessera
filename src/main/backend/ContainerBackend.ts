/**
 * Container backend (AC2.1, AC2.3, AC2.6): runs processes inside an Apple
 * `container` machine.
 *
 * {@link ContainerBackend.start} ensures the container system is up and
 * creates+boots the machine (named after the workspace id) to `running` (S1).
 * {@link ContainerBackend.spawnPty} opens a terminal *inside* that machine over
 * a PTY (S2 / AC2.3). readFile/writeFile/listDir hit the machine's filesystem
 * via one-shot `machine run` commands (S3 / AC2.3) — the editor reads, saves,
 * and browses container files through them. The remaining capabilities are
 * still stubs and land with their journeys:
 *   - runProcess → machine exec
 *   - getEnv     → machine env
 * Stop/restart (AC2.6) land in S6.
 */
import { NotImplementedError } from '@shared/errors'
import type { BackendKind, BackendStatus, ContainerHomeMount, DirEntry } from '@shared/types'
import type { RoutingEndpoint, RoutingProvider } from '@main/routing'
import type {
  Backend,
  ProcessResult,
  PtyProcess,
  PtySpawnOptions,
  RunProcessOptions
} from './Backend'
import type { ContainerRuntime } from './ContainerRuntime'

/**
 * The guest-side browser shim (POSIX sh). Reads the injected route endpoint
 * (`TESSERA_ROUTE_{PORT,TOKEN}`) and posts one JSON line to the host's
 * per-workspace routing channel, so a container browser-open lands as a new host
 * browser tab (direction A, AC3.2).
 *
 * Host discovery: the container's default gateway *is* the host under NAT, so it
 * is read straight from `/proc/net/route` (no `ip` binary needed — many images
 * lack it) and tried first, then the injected `TESSERA_ROUTE_HOST`, then the
 * vmnet default; whichever accepts a connection wins (subnets differ: Apple
 * `container` 192.168.64/…, Docker 192.168.65/…). Transport is `bash /dev/tcp`
 * or `nc`, each capped at ~3s by a background killer (no `timeout` binary
 * needed) so a dropped SYN can't wedge the caller. On any failure it prints the
 * URL so a terminal web-link (the backup action) can still open it.
 */
const SHIM_SCRIPT = `#!/bin/sh
url=$1
[ -n "$url" ] || exit 0
port=\${TESSERA_ROUTE_PORT}
token=\${TESSERA_ROUTE_TOKEN}

fallback() {
  printf 'Tessera: open this URL in your browser:\\n%s\\n' "$url"
  exit 0
}
[ -n "$port" ] && [ -n "$token" ] || fallback

gw=
gwhex=$(awk '$2=="00000000"{print $3;exit}' /proc/net/route 2>/dev/null)
if [ -n "$gwhex" ] && [ "$gwhex" != 00000000 ]; then
  t=\${gwhex#????}; o2=$(( 0x\${t%??} ))
  t=\${gwhex#??};   o3=$(( 0x\${t%????} ))
  gw="$(( 0x\${gwhex#??????} )).$o2.$o3.$(( 0x\${gwhex%??????} ))"
fi

esc=$(printf '%s' "$url" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
line=$(printf '{"token":"%s","url":"%s"}' "$token" "$esc")

run() {
  "$@" &
  c=$!
  ( sleep 3; kill "$c" 2>/dev/null ) 2>/dev/null &
  g=$!
  wait "$c" 2>/dev/null
  s=$?
  kill "$g" 2>/dev/null
  return $s
}

send() {
  if command -v bash >/dev/null 2>&1; then
    run bash -c 'exec 2>/dev/null; exec 3<>/dev/tcp/"$1"/"$2" || exit 1; printf "%s\\n" "$3" >&3' _ "$1" "$port" "$line" && return 0
  fi
  if command -v nc >/dev/null 2>&1; then
    run sh -c 'printf "%s\\n" "$3" | nc "$1" "$2" >/dev/null 2>&1' _ "$1" "$port" "$line" && return 0
  fi
  return 1
}

for h in "$gw" "$TESSERA_ROUTE_HOST" 192.168.64.1; do
  [ -n "$h" ] || continue
  send "$h" && exit 0
done
fallback
`

export interface ContainerBackendOptions {
  /** Machine name — the owning workspace's id. */
  name: string
  image: string
  homeMount: ContainerHomeMount
  cpus?: number
  memory?: string
  /** The runtime that drives the underlying `container` machine. */
  runtime: ContainerRuntime
  /**
   * Guest→host URL routing (direction A, AC3.2). When present, the first
   * terminal spawn ensures this workspace's routing channel and installs the
   * guest shim, and every terminal is handed the route endpoint via `--env`.
   * Absent (e.g. in unit tests) disables routing — terminals still open.
   */
  routing?: RoutingProvider
}

export class ContainerBackend implements Backend {
  readonly kind: BackendKind = 'container'
  private lifecycle: BackendStatus = 'stopped'
  /** This workspace's routing endpoint, once its channel is listening. */
  private routeEndpoint: RoutingEndpoint | null = null
  /** Absolute guest path of the installed shim (the `$BROWSER` target), once set. */
  private browserShimPath: string | null = null

  constructor(private readonly options: ContainerBackendOptions) {}

  get status(): BackendStatus {
    return this.lifecycle
  }

  get image(): string {
    return this.options.image
  }

  /**
   * Ensure the container system is up, then create + boot this workspace's
   * machine to `running` (AC2.1). Idempotent once running; on failure the status
   * is left at `error` and the error is rethrown for the caller to roll back.
   */
  async start(): Promise<void> {
    if (this.lifecycle === 'running') return
    this.lifecycle = 'starting'
    try {
      await this.options.runtime.ensureSystem()
      await this.options.runtime.createMachine({
        name: this.options.name,
        image: this.options.image,
        homeMount: this.options.homeMount,
        ...(this.options.cpus !== undefined ? { cpus: this.options.cpus } : {}),
        ...(this.options.memory !== undefined ? { memory: this.options.memory } : {})
      })
      this.lifecycle = 'running'
    } catch (error) {
      this.lifecycle = 'error'
      throw error
    }
  }

  /**
   * Open a terminal *inside* the machine (AC2.3) by delegating to the runtime's
   * `container machine run` exec PTY. The session sees the container's hostname,
   * env, and filesystem — host-isolated. We deliberately do NOT forward
   * `options.env` (the caller's host-env snapshot); the machine supplies its own
   * env, plus the one explicit guest marker we set below. `options.cwd`, when
   * set, starts the shell there — a previous container terminal's live cwd,
   * tracked via OSC 7 (M-J2-S2).
   *
   * The injected `TESSERA_BACKEND=container` var tags every terminal in the
   * area with its backend (AC2.4): `echo $TESSERA_BACKEND` → `container`, the
   * host counterpart being `host`. It's a fixed machine-side var, so setting it
   * doesn't copy any host environment in — isolation (AC2.3) still holds.
   *
   * `start()` (workspace create) has already booted the machine to `running`,
   * and `machine run` also boots on demand, so there is no extra guard here.
   */
  async spawnPty(options: PtySpawnOptions): Promise<PtyProcess> {
    // The guest backend marker (AC2.4) is always set. When routing is wired,
    // ensure this workspace's channel + shim and hand the terminal the route
    // endpoint via `--env`, so a guest `xdg-open`/`$BROWSER` reaches the host
    // (direction A, AC3.2). All machine-side only — no host env crosses in.
    const env: Record<string, string> = { TESSERA_BACKEND: 'container' }
    const routing = await this.ensureRouting()
    if (routing) {
      // `$BROWSER` is the shim's *actual* installed path (resolved in the guest —
      // a non-root guest can't use /usr/local/bin), so it never points at a
      // missing file.
      env.BROWSER = routing.browser
      env.TESSERA_ROUTE_HOST = routing.endpoint.host
      env.TESSERA_ROUTE_PORT = String(routing.endpoint.port)
      env.TESSERA_ROUTE_TOKEN = routing.endpoint.token
    }
    return this.options.runtime.spawnExecPty(this.options.name, {
      cols: options.cols,
      rows: options.rows,
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      env
    })
  }

  /**
   * Bring up this workspace's guest→host routing (direction A, AC3.2), returning
   * the route endpoint plus the installed shim's absolute path for `--env`
   * injection, or `null` when routing is disabled or unavailable. Idempotent and
   * lazy: the first terminal spawn (on create *or* boot restore, where `start`
   * never ran) opens the channel and installs the shim; later spawns reuse both.
   *
   * Every step is best-effort, and crucially returns `null` (so NO `$BROWSER` is
   * set) unless the shim was actually installed — a `$BROWSER` pointing at a
   * missing file breaks every browser-open, which is worse than none. A failed
   * channel or install is logged and retried on the next spawn; the terminal
   * still opens and the web-links click stays a backup path.
   */
  private async ensureRouting(): Promise<{ endpoint: RoutingEndpoint; browser: string } | null> {
    const routing = this.options.routing
    if (!routing) return null
    if (!this.routeEndpoint) {
      try {
        this.routeEndpoint = await routing.ensureChannel(this.options.name)
      } catch {
        return null // channel didn't bind; retry on the next spawn
      }
    }
    if (!this.browserShimPath) {
      try {
        this.browserShimPath = await this.options.runtime.installBrowserShim(
          this.options.name,
          SHIM_SCRIPT
        )
      } catch (error) {
        // Do NOT set $BROWSER without a real shim path; degrade to web-links and
        // retry the install on the next spawn.
        console.error(
          `[tessera] browser routing shim install failed for ${this.options.name}:`,
          error
        )
        return null
      }
    }
    return { endpoint: this.routeEndpoint, browser: this.browserShimPath }
  }

  /**
   * File I/O against the *machine's* filesystem (AC2.3): each call delegates to
   * a one-shot `container machine run -n <name>` command, so the editor reads,
   * saves, and browses container files — never the host's (M-J2-S3).
   */
  readFile(path: string): Promise<Uint8Array> {
    return this.options.runtime.readFile(this.options.name, path)
  }

  writeFile(path: string, data: Uint8Array): Promise<void> {
    return this.options.runtime.writeFile(this.options.name, path, data)
  }

  listDir(path: string): Promise<DirEntry[]> {
    return this.options.runtime.listDir(this.options.name, path)
  }

  runProcess(
    _command: string,
    _args: string[],
    _options?: RunProcessOptions
  ): Promise<ProcessResult> {
    throw new NotImplementedError('ContainerBackend.runProcess')
  }

  getEnv(): Promise<Record<string, string>> {
    throw new NotImplementedError('ContainerBackend.getEnv')
  }
}
