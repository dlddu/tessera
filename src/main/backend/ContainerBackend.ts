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
import type {
  Backend,
  ProcessResult,
  PtyProcess,
  PtySpawnOptions,
  RunProcessOptions
} from './Backend'
import type { ContainerRuntime } from './ContainerRuntime'

export interface ContainerBackendOptions {
  /** Machine name — the owning workspace's id. */
  name: string
  image: string
  homeMount: ContainerHomeMount
  cpus?: number
  memory?: string
  /** The runtime that drives the underlying `container` machine. */
  runtime: ContainerRuntime
}

export class ContainerBackend implements Backend {
  readonly kind: BackendKind = 'container'
  private lifecycle: BackendStatus = 'stopped'

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
   * env. `options.cwd`, when set, starts the shell there — a previous container
   * terminal's live cwd, tracked via OSC 7 (M-J2-S2).
   *
   * `start()` (workspace create) has already booted the machine to `running`,
   * and `machine run` also boots on demand, so there is no extra guard here.
   */
  spawnPty(options: PtySpawnOptions): Promise<PtyProcess> {
    return this.options.runtime.spawnExecPty(this.options.name, {
      cols: options.cols,
      rows: options.rows,
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {})
    })
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
