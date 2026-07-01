/**
 * Host backend (AC2.2): runs processes directly on the macOS host.
 *
 * `spawnPty` (node-pty) and readFile/writeFile/listDir (host fs, AC2.2) are
 * live. The remaining capabilities are still stubs and land with their
 * journeys:
 *   - runProcess → child_process
 *   - getEnv     → host process.env / login shell env
 */
import { randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { NotImplementedError } from '@shared/errors'
import type { BackendKind, BackendStatus, DirEntry } from '@shared/types'
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
  /** The host is always live; there is nothing to boot. */
  readonly status: BackendStatus = 'running'

  constructor(private readonly options: HostBackendOptions) {}

  get cwd(): string {
    return this.options.cwd
  }

  /** No-op: the host backend is `running` from construction. */
  async start(): Promise<void> {}

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

  /**
   * Resolve a request path against the workspace cwd. Relative paths are bound
   * to the cwd; absolute paths (e.g. from the host file picker) pass through.
   */
  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(this.options.cwd, path)
  }

  async readFile(path: string): Promise<Uint8Array> {
    return await readFile(this.resolvePath(path))
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    await writeFile(this.resolvePath(path), data)
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(this.resolvePath(path), { withFileTypes: true })
    return entries.map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }))
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
