import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Capture ipcMain.handle registrations so the create handler can be invoked
// directly, and stub the rest of the electron surface the module imports.
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

// The container create handler must NOT consult the host filesystem — force any
// cwd check to fail so a passing container create proves it was skipped.
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async () => {
    throw new Error('ENOENT')
  })
}))

import { IpcChannels } from '@shared/ipc'
import type { CreateWorkspaceRequest } from '@shared/ipc'
import type { Backend, ExecPtyOptions, NativePty, PtyProcess, PtySpawn } from '@main/backend'
import {
  BackendRegistry,
  ContainerBackend,
  ContainerRuntimeUnavailableError,
  HostBackend,
  createCliContainerRuntime
} from '@main/backend'
import type { ContainerRuntime, CreateMachineSpec } from '@main/backend'
import { registerWorkspaceIpc } from '@main/workspace'

/** A sentinel PtyProcess the fake runtime hands back from `spawnExecPty`. */
function stubPtyProcess(id: string): PtyProcess {
  return {
    id,
    write: () => {},
    resize: () => {},
    onData: () => {},
    onExit: () => {},
    kill: () => {}
  }
}

/** A container runtime that records calls and can be made to fail. */
function fakeRuntime(opts: { failCreate?: boolean } = {}) {
  const calls = {
    ensureSystem: 0,
    createMachine: [] as CreateMachineSpec[],
    spawnExecPty: [] as Array<{ name: string; options: ExecPtyOptions }>
  }
  const runtime: ContainerRuntime = {
    async ensureSystem() {
      calls.ensureSystem += 1
    },
    async createMachine(spec) {
      calls.createMachine.push(spec)
      if (opts.failCreate) throw new ContainerRuntimeUnavailableError('boom')
    },
    async status() {
      return 'running'
    },
    async spawnExecPty(name, options) {
      calls.spawnExecPty.push({ name, options })
      return stubPtyProcess(`pty-${name}`)
    }
  }
  return { runtime, calls }
}

/** A controllable in-memory stand-in for a node-pty handle. */
function makeFakeNativePty() {
  const dataListeners: Array<(data: string) => void> = []
  const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = []
  return {
    pid: 5150,
    written: [] as string[],
    resizes: [] as Array<[number, number]>,
    killed: false,
    write(data: string) {
      this.written.push(data)
    },
    resize(cols: number, rows: number) {
      this.resizes.push([cols, rows])
    },
    onData(listener: (data: string) => void) {
      dataListeners.push(listener)
    },
    onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
      exitListeners.push(listener)
    },
    kill() {
      this.killed = true
    },
    emitData(data: string) {
      dataListeners.forEach((l) => l(data))
    },
    emitExit(exitCode: number) {
      exitListeners.forEach((l) => l({ exitCode }))
    }
  }
}

describe('createCliContainerRuntime', () => {
  it('formats `machine create` args: name, resources, home-mount, image', async () => {
    const calls: string[][] = []
    const runtime = createCliContainerRuntime(async (args) => {
      calls.push(args)
      return { stdout: '', stderr: '' }
    })

    await runtime.createMachine({
      name: 'ws-1',
      image: 'node:22',
      homeMount: 'ro',
      cpus: 4,
      memory: '8G'
    })

    expect(calls).toEqual([
      [
        'machine',
        'create',
        '--name',
        'ws-1',
        '--cpus',
        '4',
        '--memory',
        '8G',
        '--home-mount',
        'ro',
        'node:22'
      ]
    ])
  })

  it('omits unset resource flags', async () => {
    const calls: string[][] = []
    const runtime = createCliContainerRuntime(async (args) => {
      calls.push(args)
      return { stdout: '', stderr: '' }
    })

    await runtime.createMachine({ name: 'ws-2', image: 'node:22', homeMount: 'rw' })

    expect(calls[0]).toEqual([
      'machine',
      'create',
      '--name',
      'ws-2',
      '--home-mount',
      'rw',
      'node:22'
    ])
  })

  it('caches ensureSystem so the daemon starts once', async () => {
    const calls: string[][] = []
    const runtime = createCliContainerRuntime(async (args) => {
      calls.push(args)
      return { stdout: '', stderr: '' }
    })

    await runtime.ensureSystem()
    await runtime.ensureSystem()

    expect(calls).toEqual([['system', 'start']])
  })

  it('maps a missing `container` binary to ContainerRuntimeUnavailableError', async () => {
    const runtime = createCliContainerRuntime(async () => {
      throw Object.assign(new Error('spawn container ENOENT'), { code: 'ENOENT' })
    })

    await expect(
      runtime.createMachine({ name: 'ws-3', image: 'node:22', homeMount: 'rw' })
    ).rejects.toBeInstanceOf(ContainerRuntimeUnavailableError)
  })

  it('reports running from `machine inspect` output', async () => {
    const runtime = createCliContainerRuntime(async () => ({
      stdout: '{ "status": "running" }',
      stderr: ''
    }))
    expect(await runtime.status('ws-1')).toBe('running')
  })
})

describe('createCliContainerRuntime — spawnExecPty', () => {
  /** Capture the argv the runtime hands to the injected PTY spawner. */
  function spyingRuntime() {
    const spawned: Array<{ file: string; args: string[] }> = []
    const fake = makeFakeNativePty()
    const spawn: PtySpawn = (file, args) => {
      spawned.push({ file, args })
      return fake as unknown as NativePty
    }
    const runtime = createCliContainerRuntime(async () => ({ stdout: '', stderr: '' }), spawn)
    return { runtime, spawned, fake }
  }

  it('runs `machine run -n <name>` inside the machine, with the cwd hook and no --workdir', async () => {
    const { runtime, spawned } = spyingRuntime()

    await runtime.spawnExecPty('ws-7', { cols: 80, rows: 24 })

    expect(spawned).toHaveLength(1)
    expect(spawned[0]!.file).toBe('container')
    expect(spawned[0]!.args).toEqual([
      'machine',
      'run',
      '-n',
      'ws-7',
      '--env',
      expect.stringContaining('PROMPT_COMMAND=')
    ])
  })

  it('passes an explicit cwd through as --workdir, before the --env hook', async () => {
    const { runtime, spawned } = spyingRuntime()

    await runtime.spawnExecPty('ws-7', { cols: 100, rows: 40, cwd: '/srv/app' })

    expect(spawned[0]!.args).toEqual([
      'machine',
      'run',
      '-n',
      'ws-7',
      '--workdir',
      '/srv/app',
      '--env',
      expect.stringContaining('PROMPT_COMMAND=')
    ])
  })

  it('emits an OSC 7 file:// cwd report from the injected hook', async () => {
    const { runtime, spawned } = spyingRuntime()
    await runtime.spawnExecPty('ws-7', { cols: 80, rows: 24 })

    // The hook is the last arg after --env; it must produce an OSC 7 sequence.
    const hook = spawned[0]!.args.at(-1)!
    expect(hook).toContain(']7;file://')
    expect(hook).toContain('$PWD')
  })

  it('maps the native PTY handle onto the PtyProcess contract', async () => {
    const { runtime, fake } = spyingRuntime()
    const proc = await runtime.spawnExecPty('ws-7', { cols: 80, rows: 24 })

    proc.write('ls\n')
    expect(fake.written).toEqual(['ls\n'])
    proc.resize(120, 50)
    expect(fake.resizes).toEqual([[120, 50]])
    proc.kill()
    expect(fake.killed).toBe(true)

    const chunks: string[] = []
    proc.onData((c) => chunks.push(c))
    fake.emitData('hi')
    expect(chunks).toEqual(['hi'])

    let exitCode: number | null = -1
    proc.onExit((code) => {
      exitCode = code
    })
    fake.emitExit(0)
    expect(exitCode).toBe(0)
  })
})

describe('ContainerBackend.spawnPty', () => {
  it('delegates to the machine name + cwd and never forwards the host env', async () => {
    const { runtime, calls } = fakeRuntime()
    const backend = new ContainerBackend({
      name: 'ws-42',
      image: 'node:22',
      homeMount: 'rw',
      runtime
    })

    const proc = await backend.spawnPty({
      cols: 100,
      rows: 40,
      cwd: '/work',
      // A host-env snapshot must NOT cross into the container (AC2.3).
      env: { SECRET: 'host-only' }
    })

    expect(calls.spawnExecPty).toEqual([
      { name: 'ws-42', options: { cols: 100, rows: 40, cwd: '/work' } }
    ])
    // The forwarded options carry no `env` key at all.
    expect(calls.spawnExecPty[0]!.options).not.toHaveProperty('env')
    expect(proc.id).toBe('pty-ws-42')
  })

  it('omits cwd when the caller does not supply one (machine default home)', async () => {
    const { runtime, calls } = fakeRuntime()
    const backend = new ContainerBackend({
      name: 'ws-1',
      image: 'node:22',
      homeMount: 'rw',
      runtime
    })

    await backend.spawnPty({ cols: 80, rows: 24 })

    expect(calls.spawnExecPty).toEqual([{ name: 'ws-1', options: { cols: 80, rows: 24 } }])
    expect(calls.spawnExecPty[0]!.options).not.toHaveProperty('cwd')
  })
})

describe('ContainerBackend.start', () => {
  it('ensures the system then creates+boots the machine to running', async () => {
    const { runtime, calls } = fakeRuntime()
    const backend = new ContainerBackend({
      name: 'ws-42',
      image: 'node:22',
      homeMount: 'rw',
      cpus: 2,
      runtime
    })

    expect(backend.status).toBe('stopped')
    await backend.start()

    expect(calls.ensureSystem).toBe(1)
    expect(calls.createMachine).toEqual([
      { name: 'ws-42', image: 'node:22', homeMount: 'rw', cpus: 2 }
    ])
    expect(backend.status).toBe('running')
  })

  it('is idempotent once running', async () => {
    const { runtime, calls } = fakeRuntime()
    const backend = new ContainerBackend({
      name: 'ws-1',
      image: 'node:22',
      homeMount: 'rw',
      runtime
    })

    await backend.start()
    await backend.start()

    expect(calls.createMachine).toHaveLength(1)
  })

  it('leaves status at error and rethrows when the machine fails to come up', async () => {
    const { runtime } = fakeRuntime({ failCreate: true })
    const backend = new ContainerBackend({
      name: 'ws-1',
      image: 'node:22',
      homeMount: 'rw',
      runtime
    })

    await expect(backend.start()).rejects.toBeInstanceOf(ContainerRuntimeUnavailableError)
    expect(backend.status).toBe('error')
  })
})

describe('BackendRegistry', () => {
  it('routes host vs container config to the right factory and never starts', () => {
    const started: string[] = []
    const stub = (kind: string): Backend =>
      ({
        kind,
        status: 'stopped',
        start: async () => {
          started.push(kind)
        }
      }) as unknown as Backend

    const registry = new BackendRegistry(
      () => stub('host'),
      () => stub('container')
    )

    const host = registry.create('ws-h', { kind: 'host', cwd: '/x' })
    const cont = registry.create('ws-c', { kind: 'container', image: 'node:22', homeMount: 'rw' })

    expect(host.kind).toBe('host')
    expect(cont.kind).toBe('container')
    expect(registry.get('ws-h')).toBe(host)
    expect(registry.get('ws-c')).toBe(cont)
    // create() only constructs + registers; it must not boot anything.
    expect(started).toEqual([])
  })
})

describe('workspace.create — container path', () => {
  let savedIds: string[]
  let deletedIds: string[]
  let store: { save: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handlers.clear()
    savedIds = []
    deletedIds = []
    store = {
      save: vi.fn(async (s: { workspaceId: string }) => {
        savedIds.push(s.workspaceId)
      }),
      delete: vi.fn(async (id: string) => {
        deletedIds.push(id)
      })
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function makeRegistry(backend: Backend) {
    const created: Array<{ id: string; backend: Backend }> = []
    const deleted: string[] = []
    const registry = new BackendRegistry(
      () => backend,
      () => backend
    )
    const origCreate = registry.create.bind(registry)
    vi.spyOn(registry, 'create').mockImplementation((id, config) => {
      created.push({ id, backend })
      return origCreate(id, config)
    })
    vi.spyOn(registry, 'delete').mockImplementation((id) => {
      deleted.push(id)
    })
    return { registry, created, deleted }
  }

  const containerReq: CreateWorkspaceRequest = {
    name: 'cont',
    backendKind: 'container',
    image: 'node:22',
    homeMount: 'rw'
  }

  function invokeCreate(req: CreateWorkspaceRequest) {
    const handler = handlers.get(IpcChannels.workspace.create)!
    return handler({}, req)
  }

  it('skips the host cwd check and starts the container backend', async () => {
    let started = false
    const backend = {
      kind: 'container',
      status: 'stopped',
      start: async () => {
        started = true
      }
    } as unknown as Backend
    const { registry } = makeRegistry(backend)
    registerWorkspaceIpc({ backends: registry, store: store as never })

    // node:fs/promises stat is mocked to throw — a host cwd check would reject
    // here. The container create must succeed regardless.
    const result = (await invokeCreate(containerReq)) as {
      workspace: { backend: { kind: string } }
    }

    expect(result.workspace.backend.kind).toBe('container')
    expect(started).toBe(true)
    expect(savedIds).toHaveLength(1)
  })

  it('rolls back the snapshot + registration when the backend fails to start', async () => {
    const backend = {
      kind: 'container',
      status: 'stopped',
      start: async () => {
        throw new ContainerRuntimeUnavailableError('container CLI missing')
      }
    } as unknown as Backend
    const { registry, deleted } = makeRegistry(backend)
    registerWorkspaceIpc({ backends: registry, store: store as never })

    await expect(invokeCreate(containerReq)).rejects.toThrow(/백엔드를 시작하지 못했습니다/)

    // The half-created workspace must not linger: backend dropped + snapshot deleted.
    expect(deleted).toHaveLength(1)
    expect(deletedIds).toEqual(savedIds)
    expect(deletedIds).toHaveLength(1)
  })

  it('rejects a container create with no image before touching the backend', async () => {
    const backend = { kind: 'container', status: 'stopped', start: vi.fn() } as unknown as Backend
    const { registry, created } = makeRegistry(backend)
    registerWorkspaceIpc({ backends: registry, store: store as never })

    await expect(invokeCreate({ name: 'x', backendKind: 'container' })).rejects.toThrow()
    expect(created).toHaveLength(0)
    expect(savedIds).toHaveLength(0)
  })
})

describe('HostBackend lifecycle', () => {
  it('is running from construction and start is a no-op', async () => {
    const backend = new HostBackend({ cwd: '/x' })
    expect(backend.status).toBe('running')
    await expect(backend.start()).resolves.toBeUndefined()
    expect(backend.status).toBe('running')
  })
})
