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
 *   - {@link ContainerRuntime.stopMachine} → `container machine stop <name>` and
 *     {@link ContainerRuntime.removeMachine} → `container machine rm <name>`
 *     (delete including persistent storage) — the lifecycle verbs behind AC2.6.
 *   - {@link ContainerRuntime.bootMachine} → boots a stopped machine back to
 *     `running`. There is no `machine start` subcommand; `machine run` boots the
 *     machine first when it is stopped, so a no-op one-shot over the exec PTY is
 *     the boot. Restart is therefore stop-then-boot (see ContainerBackend).
 *   - {@link ContainerRuntime.spawnExecPty} → `container machine run -n …`, an
 *     interactive login shell *inside* the machine over a PTY (AC2.3).
 *   - {@link ContainerRuntime.readFile} / {@link ContainerRuntime.writeFile} /
 *     {@link ContainerRuntime.listDir} → one-shot `container machine run -n …`
 *     commands against the machine's filesystem (M-J2-S3). `machine run`
 *     insists on a real terminal, so these ride the same node-pty transport as
 *     the interactive terminals; data crosses the PTY only as base64 between
 *     fixed markers, so binary content round-trips intact (see `runPty`).
 *
 * A missing CLI / dead daemon surfaces as {@link ContainerRuntimeUnavailableError}
 * so the create handler can roll back and the dialog can show a clear message.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
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
  /**
   * Guest environment variables to inject via `--env K=V` (M-J2-S4, AC2.4).
   * These are *machine-side* vars set explicitly — e.g. `TESSERA_BACKEND` — not
   * the host launcher's environment, which never crosses into the guest.
   */
  env?: Record<string, string>
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
   * Stop a running machine (AC2.6): `container machine stop <name>`. The machine
   * and its persistent storage survive — only the VM is shut down, so a later
   * {@link ContainerRuntime.bootMachine} brings the same machine back.
   */
  stopMachine(name: string): Promise<void>
  /**
   * Boot a stopped machine back to `running` (AC2.6). The CLI has no `machine
   * start`; `machine run` boots the machine when it is stopped, so this rides a
   * no-op one-shot (`:`) over the same exec-PTY transport the file I/O uses and
   * returns once the guest actually ran — i.e. once the machine is up.
   */
  bootMachine(name: string): Promise<void>
  /**
   * Delete a machine and its persistent storage (AC2.6):
   * `container machine rm <name>`. Irreversible on the container side — the
   * workspace's restore state lives on the host and is untouched (AC4.5).
   */
  removeMachine(name: string): Promise<void>
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
  /**
   * Install the browser-routing shim (PRD-3, AC3.2) into the machine and return
   * the absolute guest path it was written to (the `$BROWSER` target). Installs
   * as `tessera-open` + `xdg-open` + `open` (all `chmod +x`) into a *guest-
   * resolved* directory — the first absolute, existing, writable dir on `$PATH`
   * (so a bare `xdg-open` resolves), else `$HOME/.local/bin` (created; still
   * reachable via `$BROWSER`). A fixed `/usr/local/bin` would fail for a non-root
   * guest, so the dir is probed at runtime. The script travels as base64 (its
   * quotes/`$`/newlines can't collide with the alphabet), exactly as
   * {@link ContainerRuntime.writeFile} does. Rejects if nothing could be written.
   */
  installBrowserShim(name: string, contents: string): Promise<string>
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
 * Runs one management CLI command (`system start` / `machine create` /
 * `inspect`), resolving its stdout/stderr. `machine run` one-shots do NOT go
 * through this — they need a terminal and ride the PTY (see `runPty`).
 * Injectable so the CLI runtime is unit-testable; production uses
 * {@link defaultExec}.
 */
export type ContainerCliExec = (args: string[]) => Promise<{ stdout: string; stderr: string }>

/** Name of the CLI binary; pinned here so a version bump is one edit. */
const CONTAINER_BIN = 'container'

/**
 * Guest prompt hooks, injected as `--env`s so the guest itself reports, before
 * each prompt, the two things the renderer needs: its live cwd via OSC 7 (so a
 * new terminal opens where the last one was, M-J2-S2) and its shell name via
 * OSC 2 as a tab-title baseline. A container terminal's host PTY is the
 * `container` CLI, not the guest shell, so node-pty's process poll can't name the
 * guest's foreground process — the guest cooperating over OSC is the only clean
 * way in. Each hook emits `ESC ] 7 ; file://<host>/<pwd>` then `ESC ] 2 ; <shell>`
 * before each prompt; two cover the two common container login shells:
 *
 *  - {@link PROMPT_HOOK_BASH} — bash runs `PROMPT_COMMAND` (a direct printf)
 *    before each prompt.
 *  - {@link PROMPT_HOOK_SH} — POSIX sh (dash / busybox ash) has no
 *    `PROMPT_COMMAND`, but re-expands `PS1` before each prompt (command
 *    substitution included). The sequences ride as a *side effect* of a
 *    `$(printf … >&2)`: printf writes them to the terminal (fd 2) and the
 *    substitution captures its empty stdout, so they never appear in the prompt
 *    *text*. That matters — POSIX sh has no `\[…\]` non-printing markers, so an
 *    escape embedded directly in `PS1` would be counted in the prompt width and
 *    corrupt redraws (lost lines / a "reset" look) on every resize. Only the
 *    visible `[<pwd>] $ ` is counted. BEL terminates each OSC (no `ESC \`, whose
 *    trailing `\` a following `[` could swallow on shells that treat `\[` as a
 *    marker).
 *
 * The OSC 2 title is just the shell name — the baseline a tab resets to at each
 * prompt. While a command runs, programs that set their own title (vim, top,
 * tmux, ssh …) override it through xterm's `onTitleChange`; a plain CLI that sets
 * no title (e.g. `node script.js`) leaves the shell-name baseline showing — the
 * guest-cooperative ceiling, since the host can't see the guest's foreground
 * process.
 *
 * Both set only guest-side vars, so no host environment is copied in — isolation
 * (AC2.3) holds. Best-effort: an image whose login profile *re-sets* `PS1` after
 * these are applied overrides it (bash still reports via `PROMPT_COMMAND`); a
 * shell honouring neither hook (e.g. zsh) falls back to the machine default —
 * graceful degradation, not an error.
 */
const PROMPT_HOOK_BASH = `PROMPT_COMMAND=printf '\\033]7;file://%s%s\\033\\\\\\033]2;bash\\007' "$HOSTNAME" "$PWD"`
const PROMPT_HOOK_SH = `PS1=$(printf '\\033]7;file://%s%s\\007\\033]2;sh\\007' "$HOSTNAME" "$PWD" >&2)[$PWD] $ `

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
 * Runs one management command with its stdio bound to real temp files — the
 * same shape as `container … < in > out 2> err` in a shell — and never to Node
 * pipes, which are AF_UNIX *socketpairs* on macOS that some CLI stdio probing
 * chokes on ("Operation not supported on socket"). Exported for direct unit
 * tests against real binaries; the error shape mirrors `execFile`'s ("Command
 * failed" message, `code`, captured `stdout`/`stderr`), which `isMissingBinary`
 * and the user-facing messages rely on.
 */
export function defaultExec(binary: string): ContainerCliExec {
  return async (args) => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-container-cli-'))
    try {
      const stdinPath = join(dir, 'stdin')
      const stdoutPath = join(dir, 'stdout')
      const stderrPath = join(dir, 'stderr')
      // An empty stdin file gives the command immediate EOF instead of a hang.
      await writeFile(stdinPath, '')
      const files = await Promise.all([
        open(stdinPath, 'r'),
        open(stdoutPath, 'w'),
        open(stderrPath, 'w')
      ])
      const exitCode = await new Promise<number | null>((resolvePromise, reject) => {
        const child = spawn(binary, args, { stdio: files.map((file) => file.fd) })
        // Spawn failures (e.g. ENOENT) keep their `code` for isMissingBinary.
        child.once('error', reject)
        child.once('exit', (code) => resolvePromise(code))
      }).finally(() => Promise.all(files.map((file) => file.close())))
      const [stdout, stderr] = await Promise.all([
        readFile(stdoutPath, 'utf8'),
        readFile(stderrPath, 'utf8')
      ])
      if (exitCode !== 0) {
        throw Object.assign(new Error(`Command failed: ${binary} ${args.join(' ')}\n${stderr}`), {
          code: exitCode,
          stdout,
          stderr
        })
      }
      return { stdout, stderr }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

/** True when an exec error means the `container` binary isn't installed/on PATH. */
function isMissingBinary(error: unknown): boolean {
  return (error as CliExecError | null)?.code === 'ENOENT'
}

/**
 * Single-quote a guest path for embedding in a `sh -c` command line, so
 * whitespace and shell metacharacters survive verbatim (`'` becomes `'\''`).
 */
function shellQuote(path: string): string {
  return `'${path.replaceAll("'", `'\\''`)}'`
}

/**
 * Fixed markers bracketing a one-shot guest command's output on the exec PTY
 * (see `runPty`). Everything the guest sends between them is base64, whose
 * alphabet can never contain the markers — so the parse cannot be spoofed by
 * file content or CLI chatter.
 */
const PTY_BEGIN = '__TESSERA_BEGIN__'
const PTY_END = '__TESSERA_END__'

/**
 * Base64 payload slice embedded per write command (see `runPty` — the whole
 * command travels as one shell statement, so the slice rides inside it as a
 * quoted literal). Linux caps one exec argument at 128KiB (MAX_ARG_STRLEN) and
 * the joined statement lands in the guest as a single `sh -c` argument; 96KiB
 * leaves headroom for the rest of the command line and stays 4-aligned, so
 * every slice decodes as standalone base64.
 */
const WRITE_CHUNK_B64_CHARS = 96 * 1024

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

  async stopMachine(name: string): Promise<void> {
    try {
      await this.run(['machine', 'stop', name])
    } catch (error) {
      throw this.toUnavailable(error, '컨테이너 머신을 정지하지 못했습니다.')
    }
  }

  async bootMachine(name: string): Promise<void> {
    // No `machine start` exists: `machine run` boots a stopped machine before
    // running its command, so the cheapest possible guest command (`:`) is the
    // boot. It goes through `runPty` for the same reason the file one-shots do —
    // `machine run` insists on a real terminal.
    try {
      await this.runPty(name, ':')
    } catch (error) {
      throw this.toUnavailable(error, '컨테이너 머신을 시작하지 못했습니다.')
    }
  }

  async removeMachine(name: string): Promise<void> {
    try {
      await this.run(['machine', 'rm', name])
    } catch (error) {
      throw this.toUnavailable(error, '컨테이너 머신을 제거하지 못했습니다.')
    }
  }

  async spawnExecPty(name: string, options: ExecPtyOptions): Promise<PtyProcess> {
    const spawn = this.ptySpawn ?? (await getNodePtySpawn())

    // `container machine run -n <name> [--workdir <cwd>] --env <PROMPT_COMMAND>
    //  --env <PS1> [--env K=V …]`. The two prompt hooks (bash + sh; OSC 7 cwd +
    //  OSC 2 title) and the explicit guest vars (e.g. TESSERA_BACKEND=container,
    //  AC2.4) ride as repeated `--env`s — all machine-side only, so host
    //  isolation holds.
    const args = ['machine', 'run', '-n', name]
    if (options.cwd !== undefined) {
      args.push('--workdir', options.cwd)
    }
    args.push('--env', PROMPT_HOOK_BASH)
    args.push('--env', PROMPT_HOOK_SH)
    for (const [key, value] of Object.entries(options.env ?? {})) {
      args.push('--env', `${key}=${value}`)
    }

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
    // backend-agnostic PtyProcess contract. `process` is deliberately omitted —
    // this host PTY runs the `container` CLI, not the guest shell, so its
    // foreground-process name is `container`, not the process the user actually
    // ran inside the machine. A container terminal's tab keeps its default title.
    return {
      id: `pty-${randomUUID()}`,
      write: (data) => pty.write(data),
      resize: (cols, rows) => pty.resize(cols, rows),
      onData: (listener) => pty.onData(listener),
      onExit: (listener) => pty.onExit((event) => listener(event.exitCode, event.signal)),
      kill: () => pty.kill()
    }
  }

  async readFile(name: string, path: string): Promise<Uint8Array> {
    // Redirection (not an argv) so any `sh` handles odd filenames; the output
    // is pure base64, which survives the PTY and cannot collide with the end
    // marker. Node's decoder ignores the newlines `base64` wraps lines with.
    const body = await this.runPty(name, `base64 < ${shellQuote(path)}`)
    return Uint8Array.from(Buffer.from(body, 'base64'))
  }

  async writeFile(name: string, path: string, data: Uint8Array): Promise<void> {
    // Nothing can be *written* to the exec PTY reliably (canonical-mode line
    // limits + echo), so the bytes travel as base64 slices embedded in the
    // command string itself — single-quoted literals are safe because the
    // base64 alphabet cannot contain a quote — sized so the whole command
    // stays under the guest's per-argument exec limit. Slices accumulate in a
    // sibling partial file; only a fully-written file is moved onto the
    // target, so a failed save never truncates it (a stray `.tessera-partial`
    // may remain, overwritten by the next save).
    const target = shellQuote(path)
    const partial = shellQuote(`${path}.tessera-partial`)
    const b64 = Buffer.from(data).toString('base64')
    const chunks: string[] = []
    for (let i = 0; i < b64.length; i += WRITE_CHUNK_B64_CHARS) {
      chunks.push(b64.slice(i, i + WRITE_CHUNK_B64_CHARS))
    }
    if (chunks.length === 0) {
      chunks.push('')
    }
    for (let i = 0; i < chunks.length; i++) {
      const redirect = i === 0 ? '>' : '>>'
      const finalize = i === chunks.length - 1 ? ` && mv -f ${partial} ${target}` : ''
      await this.runPty(
        name,
        `printf %s '${chunks[i]!}' | base64 -d ${redirect} ${partial}${finalize}`
      )
    }
  }

  async installBrowserShim(name: string, contents: string): Promise<string> {
    // The whole script rides as one base64 literal (its quotes/`$`/newlines can't
    // collide with the base64 alphabet). The install dir is resolved *in the
    // guest*: the first absolute, existing, writable dir on $PATH (so `xdg-open`
    // resolves by name), else $HOME/.local/bin (created). A non-root guest can't
    // write /usr/local/bin, so a fixed path would silently fail — this probes
    // instead. The trailing `printf` echoes the installed shim's absolute path
    // (captured between the runPty markers) for the caller's `$BROWSER`.
    const b64 = Buffer.from(contents, 'utf8').toString('base64')
    const script =
      'd=; oldifs=$IFS; IFS=:; ' +
      'for p in $PATH; do case $p in /*) ;; *) continue ;; esac; ' +
      'if [ -d "$p" ] && [ -w "$p" ]; then d=$p; break; fi; done; ' +
      'IFS=$oldifs; [ -n "$d" ] || { d=$HOME/.local/bin; mkdir -p "$d"; }; ' +
      `printf %s '${b64}' | base64 -d > "$d/tessera-open" && chmod +x "$d/tessera-open" && ` +
      'cp -f "$d/tessera-open" "$d/xdg-open" && cp -f "$d/tessera-open" "$d/open" && ' +
      'chmod +x "$d/xdg-open" "$d/open" && printf %s "$d/tessera-open"'
    const path = (await this.runPty(name, script)).trim()
    if (!path) {
      throw new Error('browser shim install produced no path')
    }
    return path
  }

  async listDir(name: string, path: string): Promise<DirEntry[]> {
    // `-1` one name per line, `-A` dotfiles without `.`/`..`, `-p` a trailing
    // `/` on directories — the one bit the browser needs to descend vs open.
    // The listing is re-encoded to base64 so names survive the PTY and the
    // marker parse; a failed `ls` short-circuits the `&&`, leaving its stderr
    // and exit status for the error path.
    const body = await this.runPty(
      name,
      `out=$(ls -1Ap -- ${shellQuote(path)}) && printf %s "$out" | base64`
    )
    return Buffer.from(body, 'base64')
      .toString('utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) =>
        line.endsWith('/') ? { name: line.slice(0, -1), isDir: true } : { name: line, isDir: false }
      )
  }

  /**
   * Run one guest command via `machine run` on an exec PTY and return the text
   * it printed between the {@link PTY_BEGIN}/{@link PTY_END} markers.
   *
   * `machine run` insists on a real terminal — it probes its stdio with
   * terminal ioctls and aborts when they fail ("Operation not supported on
   * socket" on Node's pipes, "Inappropriate ioctl for device" on plain files) —
   * so one-shots ride the same node-pty transport that the interactive
   * terminals already prove out.
   *
   * IMPORTANT: `machine run` does NOT preserve command argv boundaries — it
   * joins every trailing argument with spaces and hands the *string* to a guest
   * shell for re-parsing (observed on-device: an `sh -c <script> <arg>` form
   * ran `sh -c echo` and printed the `<arg>` filler). So the whole command must
   * be ONE trailing argument that is itself a valid shell statement, with any
   * data embedded pre-quoted; positional arguments cannot be used. That
   * statement is
   *
   *   echo BEGIN; <script>; echo END$?
   *
   * bracketing the guest's output with the markers and its exit status. The
   * PTY cooks the stream (`\n` → `\r\n`) and the CLI decorates it with ANSI
   * control sequences (cursor hide/show was observed), so both are stripped
   * before parsing and callers put arbitrary data on the wire only as base64.
   * Nothing is ever written to the PTY, so there is no input echo to filter.
   * Rejects when the markers never appear (the CLI failed before the guest
   * ran) or the guest exit status is non-zero — both with the captured output
   * as the detail.
   */
  private async runPty(name: string, script: string): Promise<string> {
    const spawn = this.ptySpawn ?? (await getNodePtySpawn())
    const wrapped = `echo ${PTY_BEGIN}; ${script}; echo ${PTY_END}$?`
    const pty = spawn(CONTAINER_BIN, ['machine', 'run', '-n', name, wrapped], {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      // Host-side launcher cwd/env, exactly as in spawnExecPty — the guest
      // command sees only the machine's own environment (AC2.3).
      cwd: homedir(),
      env: hostEnv()
    })
    const raw = await new Promise<string>((resolvePromise) => {
      let buffer = ''
      pty.onData((chunk) => {
        buffer += chunk
      })
      pty.onExit(() => resolvePromise(buffer))
    })
    // Strip PTY carriage returns plus ANSI CSI/OSC decorations before parsing;
    // none of them can occur in the markers or a base64 body. The control
    // characters are the point here — ESC/BEL delimit the escape sequences.
    const text = raw
      .replaceAll('\r', '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    const match = new RegExp(`${PTY_BEGIN}\\n([\\s\\S]*?)${PTY_END}(\\d+)`).exec(text)
    if (!match) {
      const detail = text.trim().slice(-400)
      throw new Error(`container machine run did not complete: ${detail || '(no output)'}`)
    }
    const [, body, status] = match
    if (status !== '0') {
      const detail = body!.trim().slice(-400)
      throw new Error(`guest command failed (exit ${status}): ${detail || '(no output)'}`)
    }
    return body!
  }

  private run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return this.exec(args)
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
 * tests; production uses {@link defaultExec} and lazily-loaded node-pty.
 */
export function createCliContainerRuntime(
  exec: ContainerCliExec = defaultExec(CONTAINER_BIN),
  ptySpawn: PtySpawn | null = null
): ContainerRuntime {
  return new CliContainerRuntime(exec, ptySpawn)
}
