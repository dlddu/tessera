/**
 * Apple `container` machine runtime adapter (M-J2-S1, AC2.1).
 *
 * A thin, injectable wrapper over the `container` CLI's `machine` subcommands so
 * the backend layer can stand up a real VM-backed machine without importing
 * `child_process` directly — production wires {@link createCliContainerRuntime};
 * unit tests inject a fake {@link ContainerRuntime}.
 *
 * The three operations S1 needs:
 *   - {@link ContainerRuntime.ensureSystem} → `container system start` (once).
 *   - {@link ContainerRuntime.createMachine} → `container machine create …`,
 *     which both creates AND boots the machine to `running`.
 *   - {@link ContainerRuntime.status} → `container machine inspect`, mapped to a
 *     {@link BackendStatus}.
 *
 * A missing CLI / dead daemon surfaces as {@link ContainerRuntimeUnavailableError}
 * so the create handler can roll back and the dialog can show a clear message.
 */
import { execFile } from 'node:child_process'
import type { BackendStatus, ContainerHomeMount } from '@shared/types'

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
 * Injectable so the CLI runtime is unit-testable; the default shells out to the
 * real binary via {@link execFile}.
 */
export type ContainerCliExec = (args: string[]) => Promise<{ stdout: string; stderr: string }>

/** Name of the CLI binary; pinned here so a version bump is one edit. */
const CONTAINER_BIN = 'container'

interface CliExecError extends Error {
  code?: string
}

function defaultExec(binary: string): ContainerCliExec {
  return (args) =>
    new Promise((resolvePromise, reject) => {
      execFile(binary, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }))
        } else {
          resolvePromise({ stdout, stderr })
        }
      })
    })
}

/** True when an exec error means the `container` binary isn't installed/on PATH. */
function isMissingBinary(error: unknown): boolean {
  return (error as CliExecError | null)?.code === 'ENOENT'
}

class CliContainerRuntime implements ContainerRuntime {
  /** Cached `ensureSystem` promise so the daemon is only started once. */
  private systemStarted: Promise<void> | null = null

  constructor(private readonly exec: ContainerCliExec) {}

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
 * `exec` is injectable for tests; production uses {@link execFile}.
 */
export function createCliContainerRuntime(
  exec: ContainerCliExec = defaultExec(CONTAINER_BIN)
): ContainerRuntime {
  return new CliContainerRuntime(exec)
}
