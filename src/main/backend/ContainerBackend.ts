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
 * The guest-side browser shim (POSIX sh). It reads the injected route endpoint
 * (`TESSERA_ROUTE_{HOST,PORT,TOKEN}`) and posts one JSON line to the host's
 * per-workspace routing channel, so a container browser-open lands as a new host
 * browser tab (direction A, AC3.2). The host address falls back to the guest's
 * default gateway (which, under the `container` vmnet NAT, *is* the host) and
 * then the vmnet default, so routing survives an unknown gateway. Transport
 * falls back `nc` → `bash /dev/tcp`; if everything fails it prints the URL, so a
 * terminal web-link (the backup action) can still open it. Only `\` and `"` need
 * escaping to keep the JSON string well-formed — neither is common in an auth URL.
 */
const SHIM_SCRIPT = `#!/bin/sh
# Tessera browser routing shim (PRD-3, AC3.2). Installed as xdg-open/open/
# tessera-open and wired via $BROWSER. Best-effort: prints the URL on failure.
url=$1
[ -n "$url" ] || exit 0

host=\${TESSERA_ROUTE_HOST}
if [ -z "$host" ]; then
  host=$(ip route 2>/dev/null | awk '/^default/ { print $3; exit }')
fi
[ -n "$host" ] || host=192.168.64.1
port=\${TESSERA_ROUTE_PORT}
token=\${TESSERA_ROUTE_TOKEN}

if [ -n "$port" ] && [ -n "$token" ]; then
  esc=$(printf '%s' "$url" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
  line=$(printf '{"token":"%s","url":"%s"}' "$token" "$esc")
  if command -v nc >/dev/null 2>&1; then
    printf '%s\\n' "$line" | nc "$host" "$port" >/dev/null 2>&1 && exit 0
  fi
  if command -v bash >/dev/null 2>&1; then
    bash -c 'exec 3<>/dev/tcp/"$1"/"$2" || exit 1; printf "%s\\n" "$3" >&3' tessera-open "$host" "$port" "$line" >/dev/null 2>&1 && exit 0
  fi
fi

printf 'Tessera: open this URL in your browser:\\n%s\\n' "$url"
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
