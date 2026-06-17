/**
 * Host backend (AC2.2): runs processes directly on the macOS host.
 *
 * Skeleton stub — every capability throws. Feature work wires:
 *   - spawnPty   → node-pty (host PTY)         [native rebuild required]
 *   - readFile/writeFile → host fs
 *   - runProcess → child_process
 *   - getEnv     → host process.env / login shell env
 */
import { NotImplementedError } from '@shared/errors'
import type { BackendKind } from '@shared/types'
import type {
  Backend,
  ProcessResult,
  PtyProcess,
  PtySpawnOptions,
  RunProcessOptions
} from './Backend'

export interface HostBackendOptions {
  cwd: string
}

export class HostBackend implements Backend {
  readonly kind: BackendKind = 'host'

  constructor(private readonly options: HostBackendOptions) {}

  get cwd(): string {
    return this.options.cwd
  }

  spawnPty(_options: PtySpawnOptions): Promise<PtyProcess> {
    throw new NotImplementedError('HostBackend.spawnPty (node-pty)')
  }

  readFile(_path: string): Promise<Uint8Array> {
    throw new NotImplementedError('HostBackend.readFile')
  }

  writeFile(_path: string, _data: Uint8Array): Promise<void> {
    throw new NotImplementedError('HostBackend.writeFile')
  }

  runProcess(
    _command: string,
    _args: string[],
    _options?: RunProcessOptions
  ): Promise<ProcessResult> {
    throw new NotImplementedError('HostBackend.runProcess')
  }

  getEnv(): Promise<Record<string, string>> {
    throw new NotImplementedError('HostBackend.getEnv')
  }
}
