/**
 * Host backend (AC2.2): runs processes directly on the macOS host.
 *
 * `spawnPty` is live (node-pty). The remaining capabilities are still stubs and
 * land with their respective journeys:
 *   - readFile/writeFile → host fs
 *   - runProcess → child_process
 *   - getEnv     → host process.env / login shell env
 */
import { randomUUID } from 'node:crypto'
import { NotImplementedError } from '@shared/errors'
import type { BackendKind } from '@shared/types'
import type {
  Backend,
  ProcessResult,
  PtyProcess,
  PtySpawn,
  PtySpawnOptions,
  RunProcessOptions
} from './Backend'
import { getNodePtySpawn } from './nodePty'

/** Default shell: the user's login shell, falling back to zsh (macOS default). */
const DEFAULT_SHELL = '/bin/zsh'

export interface HostBackendOptions {
  cwd: string
  /** Override the PTY spawner (tests inject a fake). Defaults to node-pty. */
  spawn?: PtySpawn
}

/** Snapshot of the host environment as a plain string→string record. */
function hostEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  return env
}

export class HostBackend implements Backend {
  readonly kind: BackendKind = 'host'

  constructor(private readonly options: HostBackendOptions) {}

  get cwd(): string {
    return this.options.cwd
  }

  async spawnPty(options: PtySpawnOptions): Promise<PtyProcess> {
    const spawn = this.options.spawn ?? (await getNodePtySpawn())
    const shell = options.shell ?? process.env['SHELL'] ?? DEFAULT_SHELL
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd ?? this.options.cwd,
      env: options.env ?? hostEnv()
    })

    return {
      id: `pty-${randomUUID()}`,
      write: (data) => pty.write(data),
      resize: (cols, rows) => pty.resize(cols, rows),
      onData: (listener) => pty.onData(listener),
      onExit: (listener) => pty.onExit((event) => listener(event.exitCode)),
      kill: () => pty.kill()
    }
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
