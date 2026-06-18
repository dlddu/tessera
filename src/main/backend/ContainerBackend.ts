/**
 * Container backend (AC2.3, AC2.6): runs processes inside a container runtime.
 *
 * Skeleton stub — every capability throws. Feature work wires:
 *   - spawnPty   → container exec PTY (e.g. dockerode + node-pty)
 *   - readFile/writeFile → container fs (mount / runtime fs API)
 *   - runProcess → container exec
 *   - getEnv     → container env
 * Lifecycle (start/stop/remove) and latency reporting also land here (AC2.6).
 */
import { NotImplementedError } from '@shared/errors'
import type { BackendKind, ContainerMount } from '@shared/types'
import type {
  Backend,
  ProcessResult,
  PtyProcess,
  PtySpawnOptions,
  RunProcessOptions
} from './Backend'

export interface ContainerBackendOptions {
  image: string
  cwd: string
  mounts: ContainerMount[]
}

export class ContainerBackend implements Backend {
  readonly kind: BackendKind = 'container'

  constructor(private readonly options: ContainerBackendOptions) {}

  get image(): string {
    return this.options.image
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
