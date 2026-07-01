/**
 * Runtime backend abstraction (PRD-2). The upper UI (window/pane/tab, the four
 * surfaces) never knows the backend kind — it only calls this interface. Host
 * and container backends implement it identically (AC2.5).
 *
 * This is the *live* main-process contract (holds handles, callbacks). The
 * serializable config/state types live in `@shared/types`.
 */
import type { BackendKind, BackendStatus } from '@shared/types'

export interface PtySpawnOptions {
  cols: number
  rows: number
  cwd?: string
  env?: Record<string, string>
  shell?: string
}

/** A live pseudo-terminal handle. */
export interface PtyProcess {
  readonly id: string
  write(data: string): void
  resize(cols: number, rows: number): void
  onData(listener: (chunk: string) => void): void
  onExit(listener: (code: number | null) => void): void
  kill(): void
}

/**
 * The minimal slice of node-pty's `IPty` that {@link Backend} implementations
 * depend on. Declaring it here (instead of importing node-pty) keeps the
 * backend layer free of the native module so it can be unit-tested with a fake
 * {@link PtySpawn}; production injects the real node-pty spawner.
 */
export interface NativePty {
  readonly pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  onData(listener: (data: string) => void): void
  onExit(listener: (event: { exitCode: number; signal?: number | undefined }) => void): void
  kill(signal?: string): void
}

export interface NativePtyOptions {
  name: string
  cols: number
  rows: number
  cwd: string
  env: Record<string, string>
}

/** Spawns a native PTY. Injectable so backends can be tested without node-pty. */
export type PtySpawn = (file: string, args: string[], options: NativePtyOptions) => NativePty

export interface RunProcessOptions {
  cwd?: string
  env?: Record<string, string>
}

export interface ProcessResult {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * The four capabilities every backend provides: spawn a PTY, read/write files,
 * run a one-shot process, and report environment variables.
 */
export interface Backend {
  readonly kind: BackendKind

  /**
   * Last-known lifecycle status. `host` is always `running`; `container`
   * transitions starting → running (or → error) as {@link Backend.start} drives
   * the underlying machine (AC2.1, AC2.6).
   */
  readonly status: BackendStatus

  /**
   * Bring the backend up to `running`. Host is a no-op (it's always live);
   * container creates + boots its machine. Idempotent: calling it on an
   * already-running backend resolves without re-doing work. Rejects (and leaves
   * `status` at `error`) when the backend can't start.
   */
  start(): Promise<void>

  spawnPty(options: PtySpawnOptions): Promise<PtyProcess>
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array): Promise<void>
  runProcess(command: string, args: string[], options?: RunProcessOptions): Promise<ProcessResult>
  getEnv(): Promise<Record<string, string>>
}
