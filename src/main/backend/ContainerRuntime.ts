/**
 * Apple `container` machine runtime adapter (M-J2-S1 AC2.1, M-J2-S2/S3 AC2.3).
 *
 * A thin, injectable wrapper over the `container` CLI's `machine` subcommands so
 * the backend layer can stand up a real VM-backed machine without importing
 * `child_process` directly — production wires {@link createCliContainerRuntime};
 * unit tests inject a fake {@link ContainerRuntime}.
 *
 * The operations the container backend needs:
 *   - {@link ContainerRuntime.ensureSystem} → `container system start` (once).
 *   - {@link ContainerRuntime.createMachine} → `container machine create …`,
 *     which both creates AND boots the machine to `running`.
 *   - {@link ContainerRuntime.status} → `container machine inspect`, mapped to a
 *     {@link BackendStatus}.
 *   - {@link ContainerRuntime.spawnExecPty} → `container machine run -n …`, an
 *     interactive login shell *inside* the machine over a PTY (AC2.3).
 *   - {@link ContainerRuntime.readFile} / {@link ContainerRuntime.writeFile} /
 *     {@link ContainerRuntime.listDir} → one-shot `container machine run -n …`
 *     commands against the machine's filesystem (M-J2-S3). Bytes ride the CLI's
 *     text stdout/stdin as base64, so binary content round-trips intact.
 *
 * A missing CLI / dead daemon surfaces as {@link ContainerRuntimeUnavailableError}
 * so the create handler can roll back and the dialog can show a clear message.
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { BackendStatus, ContainerHomeMount, DirEntry } from '@shared/types'
import type { PtyProcess, PtySpawn } from './Backend'
import { getNodePtySpawn } from './nodePty'

/** The machine spec passed to {@link ContainerRuntime.createMachine}. */
export interface CreateMachineSpec {
  /** Machine name — the workspace id. */
  name: string
  /** Image the machine boots from. */
  image: string
  /** Host home-directory mount mode. */
  homeMount: ContainerHomeMount
  /** Optional vCPU cap. */
  cpus?: number
  /** Optional memory cap (e.g. `4G`). */
  memory?: string
}

/** Geometry (and optional starting cwd) for {@link ContainerRuntime.spawnExecPty}. */
export interface ExecPtyOptions {
  cols: number
  rows: number
  /**
   * Starting directory *inside* the machine (`--workdir`). Omitted → the
   * machine's default login home. Used to open a new container terminal where
   * the last one was (OSC 7-tracked cwd, M-J2-S2).
   */
  cwd?: string
}

/**
 * The runtime capabilities the container backend depends on. Injectable so
 * {@link ContainerBackend} can be unit-tested without the `container` CLI.
 */
export interface ContainerRuntime {
  /** Ensure the container system daemon is running (idempotent, cached). */
  ensureSystem(): Promise<void>
  /** Create AND boot a machine to `running`. Rejects if it can't come up. */
  createMachine(spec: CreateMachineSpec): Promise<void>
  /** Best-effort current status of a machine by name. */
  status(name: string): Promise<BackendStatus>
  /**
   * Open an interactive login shell inside the machine over a PTY (AC2.3):
   * `container machine run -n <name>`. The shell sees the container's hostname,
   * env, and filesystem — never the host's.
   */
  spawnExecPty(name: string, options: ExecPtyOptions): Promise<PtyProcess>
  /** Read a file from the machine's filesystem (M-J2-S3, AC2.3). */
  readFile(name: string, path: string): Promise<Uint8Array>
  /** Write bytes to a file on the machine's filesystem (M-J2-S3, AC2.3). */
  writeFile(name: string, path: string, data: Uint8Array): Promise<void>
  /** List a directory on the machine's filesystem (M-J2-S3, AC2.3). */
  listDir(name: string, path: string): Promise<DirEntry[]>
}

/**
 * The `container` CLI is missing, not on PATH, or its daemon failed. Distinct
 * type so callers can map it to a user-facing "runtime unavailable" message
 * rather than treating it as a generic failure.
 */
export class ContainerRuntimeUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ContainerRuntimeUnavailableError'
  }
}

/**
 * Runs the `container` CLI with the given args, resolving its stdout/stderr.
 * `input`, when given, is piped to the process's stdin and then closed — the
 * write path feeds `base64 -d` in the guest this way. Injectable so the CLI
 * runtime is unit-testable; the default shells out to the real binary via
 * {@link execFile}.
 */
export type ContainerCliExec = (
  args: string[],
  input?: string
) => Promise<{ stdout: string; stderr: string }>

/** Name of the CLI binary; pinned here so a version bump is one edit. */
const CONTAINER_BIN = 'container'

/**
 * OSC 7 cwd-reporting hook, injected into the guest as a single `--env`
 * `PROMPT_COMMAND`. bash runs it before each prompt, emitting
 * `ESC ] 7 ; file://<host>/<pwd> ESC \` so the renderer can track a container
 * terminal's live cwd — and open the next container terminal there (M-J2-S2).
 *
 * It sets exactly one guest variable, so it does NOT copy the host environment
 * into the machine — host isolation (AC2.3) holds. Shells that ignore
 * `PROMPT_COMMAND` (sh/zsh) simply don't report a cwd, so a new terminal falls
 * back to the default home (graceful degradation, not an error).
 */
const OSC7_CWD_HOOK = `PROMPT_COMMAND=printf '\\033]7;file://%s%s\\033\\\\' "$HOSTNAME" "$PWD"`

/**
 * Snapshot of the host environment for the `container` CLI *process* (so it can
 * resolve on PATH and reach its daemon). This is the host-side launcher env, not
 * the guest's: `container machine run` builds the guest env from the image plus
 * explicit `--env` flags and never copies the launcher's, so nothing here leaks
 * into the container (AC2.3).
 */
function hostEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  return env
}

interface CliExecError extends Error {
  code?: string
}

/**
 * stdout budget for one CLI invocation. File reads come back as base64 text, so
 * this bounds the largest openable container file (~48MB of raw bytes) — far
 * beyond anything the text editor should hold.
 */
const EXEC_MAX_BUFFER = 64 * 1024 * 1024

function defaultExec(binary: string): ContainerCliExec {
  return (args, input) =>
    new Promise((resolvePromise, reject) => {
      const child = execFile(
        binary,
        args,
        { encoding: 'utf8', maxBuffer: EXEC_MAX_BUFFER },
        (error, stdout, stderr) => {
          if (error) {
            reject(Object.assign(error, { stdout, stderr }))
          } else {
            resolvePromise({ stdout, stderr })
          }
        }
      )
      if (input !== undefined) {
        child.stdin?.end(input)
      }
    })
}

/** True when an exec error means the `container` binary isn't installed/on PATH. */
function isMissingBinary(error: unknown): boolean {
  return (error as CliExecError | null)?.code === 'ENOENT'
}

/**
 * Single-quote a guest path for embedding in a `sh -c` command line, so
 * whitespace and shell metacharacters survive verbatim (`'` becomes `'\''`).
 * Only the write path needs this — reads/listings pass the path as its own
 * argv element, which never re-enters a shell.
 */
function shellQuote(path: string): string {
  return `'${path.replaceAll("'", `'\\''`)}'`
}

class CliContainerRuntime implements ContainerRuntime {
  /** Cached `ensureSystem` promise so the daemon is only started once. */
  private systemStarted: Promise<void> | null = null

  constructor(
    private readonly exec: ContainerCliExec,
    /** PTY spawner for exec sessions; defaults to lazy node-pty. Injected in tests. */
    private readonly ptySpawn: PtySpawn | null = null
  ) {}

  ensureSystem(): Promise<void> {
    if (!this.systemStarted) {
      this.systemStarted = this.run(['system', 'start']).then(
        () => undefined,
        (error) => {
          // Don't cache a failure — a later attempt should be able to retry.
          this.systemStarted = null
          throw this.toUnavailable(error, '컨테이너 시스템을 시작하지 못했습니다.')
        }
      )
    }
    return this.systemStarted
  }

  async createMachine(spec: CreateMachineSpec): Promise<void> {
    const args = ['machine', 'create', '--name', spec.name]
    if (spec.cpus !== undefined) {
      args.push('--cpus', String(spec.cpus))
    }
    if (spec.memory !== undefined) {
      args.push('--memory', spec.memory)
    }
    args.push('--home-mount', spec.homeMount, spec.image)

    try {
      await this.run(args)
    } catch (error) {
      throw this.toUnavailable(error, '컨테이너 머신을 생성하지 못했습니다.')
    }
  }

  async status(name: string): Promise<BackendStatus> {
    try {
      const { stdout } = await this.run(['machine', 'inspect', name])
      return /running/i.test(stdout) ? 'running' : 'stopped'
    } catch {
      return 'error'
    }
  }

  async spawnExecPty(name: string, options: ExecPtyOptions): Promise<PtyProcess> {
    const spawn = this.ptySpawn ?? (await getNodePtySpawn())

    // `container machine run -n <name> [--workdir <cwd>] --env <osc7 hook>`.
    const args = ['machine', 'run', '-n', name]
    if (options.cwd !== undefined) {
      args.push('--workdir', options.cwd)
    }
    args.push('--env', OSC7_CWD_HOOK)

    const pty = spawn(CONTAINER_BIN, args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      // Host-side cwd + env for the `container` CLI process itself — NOT the
      // guest's. The guest's cwd is `--workdir` and its env is the machine's own
      // plus the one `--env` hook above, so the container stays host-isolated
      // (AC2.3). `homedir()` (not `options.cwd`, a guest path) keeps the launcher
      // in a directory that actually exists on the host.
      cwd: homedir(),
      env: hostEnv()
    })

    // Same wrapper shape as HostBackend.spawnPty: adapt the native handle to the
    // backend-agnostic PtyProcess contract.
    return {
      id: `pty-${randomUUID()}`,
      write: (data) => pty.write(data),
      resize: (cols, rows) => pty.resize(cols, rows),
      onData: (listener) => pty.onData(listener),
      onExit: (listener) => pty.onExit((event) => listener(event.exitCode)),
      kill: () => pty.kill()
    }
  }

  async readFile(name: string, path: string): Promise<Uint8Array> {
    // `base64 <path>` keeps arbitrary bytes intact across the CLI's utf8
    // stdout; Node's decoder ignores the wrapping newlines base64 emits.
    const { stdout } = await this.run(['machine', 'run', '-n', name, 'base64', path])
    return Uint8Array.from(Buffer.from(stdout, 'base64'))
  }

  async writeFile(name: string, path: string, data: Uint8Array): Promise<void> {
    // Bytes ride stdin as base64; the guest decodes them into the target file.
    await this.run(
      ['machine', 'run', '-n', name, 'sh', '-c', `base64 -d > ${shellQuote(path)}`],
      Buffer.from(data).toString('base64')
    )
  }

  async listDir(name: string, path: string): Promise<DirEntry[]> {
    // `-1` one name per line, `-A` dotfiles without `.`/`..`, `-p` a trailing
    // `/` on directories — the one bit the browser needs to descend vs open.
    const { stdout } = await this.run(['machine', 'run', '-n', name, 'ls', '-1Ap', '--', path])
    return stdout
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) =>
        line.endsWith('/') ? { name: line.slice(0, -1), isDir: true } : { name: line, isDir: false }
      )
  }

  private run(args: string[], input?: string): Promise<{ stdout: string; stderr: string }> {
    return this.exec(args, input)
  }

  /** Map a CLI failure to a clear error; a missing binary is "unavailable". */
  private toUnavailable(error: unknown, fallback: string): Error {
    if (isMissingBinary(error)) {
      return new ContainerRuntimeUnavailableError(
        'Apple `container` CLI를 찾을 수 없습니다. 설치 후 다시 시도하세요.',
        error
      )
    }
    const detail = error instanceof Error ? error.message : String(error)
    return new ContainerRuntimeUnavailableError(`${fallback} (${detail})`, error)
  }
}

/**
 * Build the production container runtime backed by the real `container` CLI.
 * `exec` (one-shot commands) and `ptySpawn` (exec sessions) are injectable for
 * tests; production uses {@link execFile} and lazily-loaded node-pty.
 */
export function createCliContainerRuntime(
  exec: ContainerCliExec = defaultExec(CONTAINER_BIN),
  ptySpawn: PtySpawn | null = null
): ContainerRuntime {
  return new CliContainerRuntime(exec, ptySpawn)
}
