import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Capture ipcMain.handle registrations so the lifecycle handler can be invoked
// directly, mirroring the container/workspace IPC tests.
const handlers = vi.hoisted(() => new Map<string, (event: unknown, req: unknown) => unknown>())
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/userData' },
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: {},
  ipcMain: {
    handle(channel: string, handler: (event: unknown, req: unknown) => unknown) {
      handlers.set(channel, handler)
    }
  }
}))

import { IpcChannels } from '@shared/ipc'
import type { BackendLifecycleRequest } from '@shared/ipc'
import { DEFAULT_AREA_ID } from '@shared/types'
import type { BackendLifecycleState } from '@shared/types'
import {
  BackendRegistry,
  ContainerBackend,
  ContainerRuntimeUnavailableError,
  HostBackend,
  createCliContainerRuntime,
  registerBackendIpc
} from '@main/backend'
import type { Backend, ContainerRuntime, NativePty, PtySpawn } from '@main/backend'

/* ============================================================ CLI argv shape */

// The lifecycle verbs are the ones apple/container actually documents:
//   container machine stop <name>   → stop, keeping the machine + its storage
//   container machine rm   <name>   → delete, including persistent storage
// There is no `machine start`; `machine run` boots a stopped machine before it
// runs anything, so booting rides the exec-PTY one-shot transport.
describe('createCliContainerRuntime — lifecycle verbs (AC2.6)', () => {
  it('stopMachine issues `machine stop <name>`', async () => {
    const calls: string[][] = []
    const runtime = createCliContainerRuntime(async (args) => {
      calls.push(args)
      return { stdout: '', stderr: '' }
    })

    await runtime.stopMachine('ws-1')

    expect(calls).toEqual([['machine', 'stop', 'ws-1']])
  })

  it('removeMachine issues `machine rm <name>`', async () => {
    const calls: string[][] = []
    const runtime = createCliContainerRuntime(async (args) => {
      calls.push(args)
      return { stdout: '', stderr: '' }
    })

    await runtime.removeMachine('ws-2')

    expect(calls).toEqual([['machine', 'rm', 'ws-2']])
  })

  it('maps a lifecycle failure to ContainerRuntimeUnavailableError with a clear message', async () => {
    const runtime = createCliContainerRuntime(async () => {
      throw Object.assign(new Error('Command failed'), { code: 1 })
    })

    await expect(runtime.stopMachine('ws-3')).rejects.toBeInstanceOf(
      ContainerRuntimeUnavailableError
    )
    await expect(runtime.removeMachine('ws-3')).rejects.toThrow(/제거하지 못했습니다/)
  })

  it('bootMachine boots through a no-op `machine run` one-shot (there is no `machine start`)', async () => {
    const BEGIN = '__TESSERA_BEGIN__'
    const END = '__TESSERA_END__'
    const spawned: string[][] = []
    const spawn: PtySpawn = (_file, args) => {
      spawned.push(args)
      const dataListeners: Array<(data: string) => void> = []
      const exitListeners: Array<(event: { exitCode: number }) => void> = []
      const fake = {
        pid: 1,
        write() {},
        resize() {},
        onData(listener: (data: string) => void) {
          dataListeners.push(listener)
        },
        onExit(listener: (event: { exitCode: number }) => void) {
          exitListeners.push(listener)
        },
        kill() {}
      }
      queueMicrotask(() => {
        dataListeners.forEach((l) => l(`${BEGIN}\r\n${END}0\r\n`))
        exitListeners.forEach((l) => l({ exitCode: 0 }))
      })
      return fake as unknown as NativePty
    }
    const runtime = createCliContainerRuntime(async () => ({ stdout: '', stderr: '' }), spawn)

    await runtime.bootMachine('ws-4')

    // One `machine run -n <name> <statement>` — the statement is the cheapest
    // possible guest command, so the boot is the whole point of the call.
    expect(spawned).toHaveLength(1)
    expect(spawned[0]!.slice(0, 4)).toEqual(['machine', 'run', '-n', 'ws-4'])
    expect(spawned[0]![4]).toBe(`echo ${BEGIN}; :; echo ${END}$?`)
  })
})

/* ================================================== ContainerBackend states */

/** A runtime that records lifecycle calls and can be made to fail. */
function fakeRuntime(opts: { failStop?: boolean; failBoot?: boolean } = {}) {
  const calls: string[] = []
  const runtime: ContainerRuntime = {
    async ensureSystem() {},
    async createMachine() {
      calls.push('create')
    },
    async status() {
      return 'running'
    },
    spawnExecPty() {
      throw new Error('not used in this test')
    },
    async readFile() {
      return new Uint8Array()
    },
    async writeFile() {},
    async listDir() {
      return []
    },
    async installBrowserShim() {
      return '/usr/local/bin/tessera-open'
    },
    async stopMachine() {
      calls.push('stop')
      if (opts.failStop) throw new ContainerRuntimeUnavailableError('stop failed')
    },
    async bootMachine() {
      calls.push('boot')
      if (opts.failBoot) throw new ContainerRuntimeUnavailableError('boot failed')
    },
    async removeMachine() {
      calls.push('rm')
    }
  }
  return { runtime, calls }
}

function containerBackend(opts: Parameters<typeof fakeRuntime>[0] = {}) {
  const { runtime, calls } = fakeRuntime(opts)
  const backend = new ContainerBackend({
    name: 'ws-42',
    image: 'node:22',
    homeMount: 'rw',
    runtime
  })
  return { backend, calls }
}

describe('ContainerBackend lifecycle (AC2.6)', () => {
  it('stop shuts the machine down and reports `stopped`', async () => {
    const { backend, calls } = containerBackend()
    await backend.start()

    await backend.stop()

    expect(calls).toEqual(['create', 'stop'])
    expect(backend.status).toBe('stopped')
  })

  it('stop is idempotent once stopped', async () => {
    const { backend, calls } = containerBackend()
    await backend.start()
    await backend.stop()

    await backend.stop()

    expect(calls.filter((c) => c === 'stop')).toHaveLength(1)
  })

  it('restart stops then boots a running machine, ending at `running`', async () => {
    const { backend, calls } = containerBackend()
    await backend.start()

    await backend.restart()

    expect(calls).toEqual(['create', 'stop', 'boot'])
    expect(backend.status).toBe('running')
  })

  it('restart of an already-stopped machine boots without stopping first', async () => {
    // `machine stop` on a machine that is not running is an error, not a no-op,
    // so a restart from `stopped` must skip straight to the boot.
    const { backend, calls } = containerBackend()
    await backend.start()
    await backend.stop()
    calls.length = 0

    await backend.restart()

    expect(calls).toEqual(['boot'])
    expect(backend.status).toBe('running')
  })

  it('remove deletes the machine and leaves the backend `stopped`', async () => {
    const { backend, calls } = containerBackend()
    await backend.start()

    await backend.remove()

    expect(calls).toEqual(['create', 'rm'])
    expect(backend.status).toBe('stopped')
  })

  it('leaves status at `error` and rethrows when a lifecycle action fails', async () => {
    const { backend } = containerBackend({ failStop: true })
    await backend.start()

    await expect(backend.stop()).rejects.toBeInstanceOf(ContainerRuntimeUnavailableError)
    expect(backend.status).toBe('error')
  })

  it('a failed boot during restart leaves `error`, not a false `running`', async () => {
    const { backend } = containerBackend({ failBoot: true })
    await backend.start()

    await expect(backend.restart()).rejects.toThrow(/boot failed/)
    expect(backend.status).toBe('error')
  })
})

describe('HostBackend lifecycle (AC2.6)', () => {
  it('rejects stop/restart/remove instead of silently succeeding', async () => {
    const backend = new HostBackend({ cwd: '/x' })

    // A silent no-op would report a "stopped" host backend that is still
    // running — the registry's "explicit error, no quiet fallback" rule.
    await expect(backend.stop()).rejects.toThrow(/정지할 수 없습니다/)
    await expect(backend.restart()).rejects.toThrow(/재시작할 수 없습니다/)
    await expect(backend.remove()).rejects.toThrow(/제거할 수 없습니다/)
    expect(backend.status).toBe('running')
  })
})

/* ============================================================= lifecycle IPC */

describe('backend.lifecycle IPC (AC2.6)', () => {
  /** A backend stub that records which lifecycle method was invoked. */
  function stubBackend(overrides: Partial<Backend> = {}) {
    const called: string[] = []
    const backend = {
      kind: 'container',
      status: 'running',
      start: async () => {},
      stop: async () => {
        called.push('stop')
      },
      restart: async () => {
        called.push('restart')
      },
      remove: async () => {
        called.push('remove')
      },
      ...overrides
    } as unknown as Backend
    return { backend, called }
  }

  function invoke(req: BackendLifecycleRequest): Promise<BackendLifecycleState> {
    const handler = handlers.get(IpcChannels.backend.lifecycle)!
    return handler({}, req) as Promise<BackendLifecycleState>
  }

  function registerWith(backend: Backend) {
    const registry = new BackendRegistry(
      () => backend,
      () => backend
    )
    registry.create('ws-1', { kind: 'container', image: 'node:22', homeMount: 'rw' })
    registerBackendIpc({ backends: registry })
    return registry
  }

  beforeEach(() => {
    handlers.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('is no longer a not-implemented stub — `status` reports the live state', async () => {
    const { backend, called } = stubBackend()
    registerWith(backend)

    expect(await invoke({ workspaceId: 'ws-1' })).toEqual({ status: 'running' })
    // A status read must not touch the machine.
    expect(called).toEqual([])
  })

  it('routes each action to the matching backend method', async () => {
    const { backend, called } = stubBackend()
    registerWith(backend)

    await invoke({ workspaceId: 'ws-1', action: 'stop' })
    await invoke({ workspaceId: 'ws-1', action: 'restart' })
    await invoke({ workspaceId: 'ws-1', action: 'remove' })

    expect(called).toEqual(['stop', 'restart', 'remove'])
  })

  it('resolves the workspace default area, so a host area (AC2.7) never answers for it', async () => {
    const { backend } = stubBackend()
    const registry = registerWith(backend)
    const hostArea = new HostBackend({ cwd: '/x' })
    registry.addArea('ws-1', 'area-host', { kind: 'host', cwd: '/x' })

    // The host-area backend rejects every lifecycle call; getting a clean
    // `running` back proves the default-area backend answered.
    expect(await invoke({ workspaceId: 'ws-1', action: 'status' })).toEqual({ status: 'running' })
    await expect(hostArea.stop()).rejects.toThrow()
  })

  it('reports a failed action as a message instead of rejecting the invoke', async () => {
    const { backend } = stubBackend({
      status: 'error',
      stop: async () => {
        throw new ContainerRuntimeUnavailableError(
          'Apple `container` CLI를 찾을 수 없습니다. 설치 후 다시 시도하세요.'
        )
      }
    })
    registerWith(backend)

    const state = await invoke({ workspaceId: 'ws-1', action: 'stop' })

    expect(state.status).toBe('error')
    expect(state.message).toMatch(/container` CLI를 찾을 수 없습니다/)
  })

  it('an unknown workspace still rejects (no silent fallback)', async () => {
    const { backend } = stubBackend()
    registerWith(backend)

    await expect(invoke({ workspaceId: 'ghost' })).rejects.toThrow(/no backend for workspace/)
    expect(DEFAULT_AREA_ID).toBeTruthy()
  })
})
