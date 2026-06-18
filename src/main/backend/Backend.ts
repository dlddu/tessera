/**
 * Runtime backend abstraction (PRD-2). The upper UI (window/pane/tab, the four
 * surfaces) never knows the backend kind — it only calls this interface. Host
 * and container backends implement it identically (AC2.5).
 *
 * This is the *live* main-process contract (holds handles, callbacks). The
 * serializable config/state types live in `@shared/types`.
 */
import type { BackendKind } from '@shared/types'

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

  spawnPty(options: PtySpawnOptions): Promise<PtyProcess>
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array): Promise<void>
  runProcess(command: string, args: string[], options?: RunProcessOptions): Promise<ProcessResult>
  getEnv(): Promise<Record<string, string>>
}
