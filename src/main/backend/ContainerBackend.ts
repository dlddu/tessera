/**
 * Container backend (AC2.1, AC2.3, AC2.6): runs processes inside an Apple
 * `container` machine.
 *
 * M-J2-S1 wires lifecycle only — {@link ContainerBackend.start} ensures the
 * container system is up and creates+boots the machine (named after the
 * workspace id) to `running`. The remaining capabilities are still stubs and
 * land with their journeys:
 *   - spawnPty   → `container machine exec` PTY (S2 / AC2.3)
 *   - readFile/writeFile → machine fs
 *   - runProcess → machine exec
 *   - getEnv     → machine env
 * Stop/restart (AC2.6) land in S6.
 */
import { NotImplementedError } from '@shared/errors'
import type { BackendKind, BackendStatus, ContainerHomeMount } from '@shared/types'
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

  spawnPty(_options: PtySpawnOptions): Promise<PtyProcess> {
    throw new NotImplementedError('ContainerBackend.spawnPty (exec PTY)')
  }

  readFile(_path: string): Promise<Uint8Array> {
    throw new NotImplementedError('ContainerBackend.readFile')
  }

  writeFile(_path: string, _data: Uint8Array): Promise<void> {
    throw new NotImplementedError('ContainerBackend.writeFile')
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
