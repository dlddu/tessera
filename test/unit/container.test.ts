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
    deleteMachine: [] as string[],
    spawnExecPty: [] as Array<{ name: string; options: ExecPtyOptions }>,
    readFile: [] as Array<{ name: string; path: string }>,
    writeFile: [] as Array<{ name: string; path: string; data: Uint8Array }>,
    listDir: [] as Array<{ name: string; path: string }>
  }
  const runtime: ContainerRuntime = {
    async ensureSystem() {
      calls.ensureSystem += 1
    },
    async createMachine(spec) {
      calls.createMachine.push(spec)
      if (opts.failCreate) throw new ContainerRuntimeUnavailableError('boom')
    },
    async deleteMachine(name) {
      calls.deleteMachine.push(name)
    },
    async status() {
      return 'running'
    },
    async spawnExecPty(name, options) {
      calls.spawnExecPty.push({ name, options })
      return stubPtyProcess(`pty-${name}`)
    },
    async readFile(name, path) {
      calls.readFile.push({ name, path })
      return new TextEncoder().encode(`guest:${path}`)
    },
    async writeFile(name, path, data) {
      calls.writeFile.push({ name, path, data })
    },
    async listDir(name, path) {
      calls.listDir.push({ name, path })
      return [
        { name: 'src', isDir: true },
        { name: 'a.ts', isDir: false }
      ]
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

  it('force-deletes a machine by name on close', async () => {
    const calls: string[][] = []
    const runtime = createCliContainerRuntime(async (args) => {
      calls.push(args)
      return { stdout: '', stderr: '' }
    })

    await runtime.deleteMachine('ws-1')

    expect(calls).toEqual([['machine', 'delete', '--force', 'ws-1']])
  })

  it('maps a failed `machine delete` to ContainerRuntimeUnavailableError', async () => {
    const runtime = createCliContainerRuntime(async () => {
      throw Object.assign(new Error('boom'), { code: 1 })
    })

    await expect(runtime.deleteMachine('ws-1')).rejects.toBeInstanceOf(
      ContainerRuntimeUnavailableError
    )
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

describe('createCliContainerRuntime — file I/O over the exec PTY (M-J2-S3)', () => {
  const BEGIN = '__TESSERA_BEGIN__'
  const END = '__TESSERA_END__'

  /** Marker-bracketed guest output as the PTY delivers it (CRLF-cooked). */
  const reply = (body: string, status = 0) => `${BEGIN}\r\n${body}${END}${status}\r\n`

  /**
   * One fake PTY per spawn: records every argv and answers each run with
   * `respond(argv, call#)` a microtask later — after the runtime has attached
   * its listeners — then exits, like a real one-shot `machine run`.
   */
  function ptyRuntime(respond: (args: string[], call: number) => string) {
    const spawned: string[][] = []
    const spawn: PtySpawn = (_file, args) => {
      const fake = makeFakeNativePty()
      const call = spawned.push(args) - 1
      queueMicrotask(() => {
        fake.emitData(respond(args, call))
        fake.emitExit(0)
      })
      return fake as unknown as NativePty
    }
    const runtime = createCliContainerRuntime(async () => ({ stdout: '', stderr: '' }), spawn)
    return { runtime, spawned }
  }

  /**
   * The command inside a recorded `machine run` argv. `machine run` joins every
   * trailing argument with spaces and re-parses the string with a guest shell
   * (argv boundaries are NOT preserved — observed on-device), so the command
   * must be exactly ONE trailing element that is a complete shell statement.
   */
  const scriptOf = (args: string[]) => {
    expect(args).toHaveLength(5)
    expect(args.slice(0, 4)).toEqual(['machine', 'run', '-n', 'ws-9'])
    return args[4]!
  }

  it('readFile wraps `base64 < <path>` in markers, as a single trailing argument', async () => {
    const content = Buffer.from('héllo, 월드', 'utf8').toString('base64')
    const { runtime, spawned } = ptyRuntime(() => reply(`${content}\r\n`))

    const bytes = await runtime.readFile('ws-9', '/etc/motd')

    expect(spawned).toHaveLength(1)
    expect(scriptOf(spawned[0]!)).toBe(`echo ${BEGIN}; base64 < '/etc/motd'; echo ${END}$?`)
    expect(new TextDecoder().decode(bytes)).toBe('héllo, 월드')
  })

  it('readFile survives CRLF cooking and `base64` line wrapping', async () => {
    const raw = 'x'.repeat(300)
    const wrapped = Buffer.from(raw, 'utf8')
      .toString('base64')
      .replace(/(.{76})/g, '$1\r\n')
    const { runtime } = ptyRuntime(() => reply(`${wrapped}\r\n`))

    const bytes = await runtime.readFile('ws-9', '/big.txt')

    expect(new TextDecoder().decode(bytes)).toBe(raw)
  })

  it('readFile ignores the ANSI decorations the CLI paints around the session', async () => {
    const content = Buffer.from('decorated', 'utf8').toString('base64')
    // Cursor-hide before, cursor-show + an OSC title after — as observed on-device.
    const { runtime } = ptyRuntime(
      () => `\x1b[?25l${reply(`${content}\r\n`)}\x1b[?25h\x1b]0;done\x07`
    )

    const bytes = await runtime.readFile('ws-9', '/etc/motd')

    expect(new TextDecoder().decode(bytes)).toBe('decorated')
  })

  it('readFile rejects with the guest error when the command exits non-zero', async () => {
    const { runtime } = ptyRuntime(() => reply("sh: can't open /nope\r\n", 2))

    await expect(runtime.readFile('ws-9', '/nope')).rejects.toThrow(/exit 2.*can't open \/nope/s)
  })

  it('rejects when the CLI dies before the guest runs (no markers)', async () => {
    const { runtime } = ptyRuntime(() => 'Error: machine not running\r\n')

    await expect(runtime.readFile('ws-9', '/etc/motd')).rejects.toThrow(
      /did not complete.*machine not running/s
    )
  })

  /** The base64 slice a write command carries as its quoted printf literal. */
  const sliceOf = (script: string) => {
    const match = /printf %s '([^']*)' \| base64 -d/.exec(script)
    expect(match).not.toBeNull()
    return match![1]!
  }

  it('writeFile embeds the bytes as one quoted base64 slice into a partial file, then moves it', async () => {
    const { runtime, spawned } = ptyRuntime(() => reply(''))

    await runtime.writeFile('ws-9', '/srv/app/a.ts', new TextEncoder().encode('saved, 저장!'))

    expect(spawned).toHaveLength(1)
    const b64 = Buffer.from('saved, 저장!', 'utf8').toString('base64')
    expect(scriptOf(spawned[0]!)).toBe(
      `echo ${BEGIN}; printf %s '${b64}' | base64 -d > '/srv/app/a.ts.tessera-partial'` +
        ` && mv -f '/srv/app/a.ts.tessera-partial' '/srv/app/a.ts'; echo ${END}$?`
    )
  })

  it('writeFile splits large payloads into standalone slices and finalizes once', async () => {
    // 96KiB of base64 per slice = 72KiB of raw bytes; +3 bytes forces slice 2.
    const raw = Buffer.alloc(72 * 1024 + 3, 7)
    const { runtime, spawned } = ptyRuntime(() => reply(''))

    await runtime.writeFile('ws-9', '/srv/big.bin', raw)

    expect(spawned).toHaveLength(2)
    expect(scriptOf(spawned[0]!)).toContain("base64 -d > '/srv/big.bin.tessera-partial'")
    expect(scriptOf(spawned[0]!)).not.toContain('mv -f')
    expect(scriptOf(spawned[1]!)).toContain("base64 -d >> '/srv/big.bin.tessera-partial'")
    expect(scriptOf(spawned[1]!)).toContain("mv -f '/srv/big.bin.tessera-partial' '/srv/big.bin'")
    // Each slice decodes standalone; together they are the original bytes.
    const joined = Buffer.concat(
      spawned.map((args) => Buffer.from(sliceOf(scriptOf(args)), 'base64'))
    )
    expect(joined.equals(raw)).toBe(true)
  })

  it('writeFile single-quotes shell-hostile paths', async () => {
    const { runtime, spawned } = ptyRuntime(() => reply(''))

    await runtime.writeFile('ws-9', "/tmp/it's a file.txt", new Uint8Array([1]))

    expect(scriptOf(spawned[0]!)).toContain("mv -f '/tmp/it'\\''s a file.txt.tessera-partial'")
    expect(scriptOf(spawned[0]!)).toContain("'/tmp/it'\\''s a file.txt'")
  })

  it('listDir re-encodes `ls -1Ap` to base64 and parses trailing slashes into DirEntry flags', async () => {
    const listing = Buffer.from('src/\n.gitignore\nREADME.md\nnode_modules/\n', 'utf8').toString(
      'base64'
    )
    const { runtime, spawned } = ptyRuntime(() => reply(`${listing}\r\n`))

    const entries = await runtime.listDir('ws-9', '/work')

    expect(scriptOf(spawned[0]!)).toBe(
      `echo ${BEGIN}; out=$(ls -1Ap -- '/work') && printf %s "$out" | base64; echo ${END}$?`
    )
    expect(entries).toEqual([
      { name: 'src', isDir: true },
      { name: '.gitignore', isDir: false },
      { name: 'README.md', isDir: false },
      { name: 'node_modules', isDir: true }
    ])
  })

  it('listDir of an empty directory yields no entries', async () => {
    const { runtime } = ptyRuntime(() => reply(''))

    expect(await runtime.listDir('ws-9', '/empty')).toEqual([])
  })

  it('listDir rejects with the ls error for an unreadable path', async () => {
    const { runtime } = ptyRuntime(() => reply('ls: /gone: No such file or directory\r\n', 1))

    await expect(runtime.listDir('ws-9', '/gone')).rejects.toThrow(/exit 1.*No such file/s)
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

describe('ContainerBackend.dispose', () => {
  it('deletes the workspace machine by name and drops to stopped', async () => {
    const { runtime, calls } = fakeRuntime()
    const backend = new ContainerBackend({
      name: 'ws-42',
      image: 'node:22',
      homeMount: 'rw',
      runtime
    })

    await backend.start()
    await backend.dispose()

    expect(calls.deleteMachine).toEqual(['ws-42'])
    expect(backend.status).toBe('stopped')
  })

  it('deletes the machine even when start was never called (restored backend)', async () => {
    const { runtime, calls } = fakeRuntime()
    // A boot-restored backend is re-registered without start(), but its machine
    // persists from the previous session — closing must still remove it.
    const backend = new ContainerBackend({
      name: 'ws-7',
      image: 'node:22',
      homeMount: 'rw',
      runtime
    })

    await backend.dispose()

    expect(calls.deleteMachine).toEqual(['ws-7'])
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

describe('workspace.close', () => {
  let store: { save: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
  let deletedIds: string[]

  beforeEach(() => {
    handlers.clear()
    deletedIds = []
    store = {
      save: vi.fn(),
      delete: vi.fn(async (id: string) => {
        deletedIds.push(id)
      })
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /** A backend whose dispose is observable and can be made to fail. */
  function fakeBackend(opts: { failDispose?: boolean } = {}) {
    const calls = { dispose: 0 }
    const backend = {
      kind: 'container',
      status: 'running',
      start: async () => {},
      dispose: async () => {
        calls.dispose += 1
        if (opts.failDispose) throw new Error('delete failed')
      }
    } as unknown as Backend
    return { backend, calls }
  }

  function registryWith(backend: Backend) {
    const registry = new BackendRegistry(
      () => backend,
      () => backend
    )
    registry.create('ws-1', { kind: 'container', image: 'node:22', homeMount: 'rw' })
    return registry
  }

  function invokeClose(workspaceId: string) {
    const handler = handlers.get(IpcChannels.workspace.close)!
    return handler({}, { workspaceId })
  }

  it('disposes the backend (deletes its machine), then drops it and its snapshot', async () => {
    const { backend, calls } = fakeBackend()
    const registry = registryWith(backend)
    registerWorkspaceIpc({ backends: registry, store: store as never })

    await invokeClose('ws-1')

    expect(calls.dispose).toBe(1)
    expect(registry.get('ws-1')).toBeUndefined()
    expect(deletedIds).toEqual(['ws-1'])
  })

  it('still removes the snapshot + registry entry when dispose fails (machine may linger)', async () => {
    const { backend, calls } = fakeBackend({ failDispose: true })
    const registry = registryWith(backend)
    registerWorkspaceIpc({ backends: registry, store: store as never })

    // A failed machine delete must not reject the close — else the snapshot
    // would survive and the workspace would resurrect on the next boot.
    await expect(invokeClose('ws-1')).resolves.toBeUndefined()

    expect(calls.dispose).toBe(1)
    expect(registry.get('ws-1')).toBeUndefined()
    expect(deletedIds).toEqual(['ws-1'])
  })

  it('closes cleanly when the workspace has no registered backend', async () => {
    const registry = new BackendRegistry(
      () => ({}) as unknown as Backend,
      () => ({}) as unknown as Backend
    )
    registerWorkspaceIpc({ backends: registry, store: store as never })

    await expect(invokeClose('ws-missing')).resolves.toBeUndefined()
    expect(deletedIds).toEqual(['ws-missing'])
  })
})

describe('HostBackend lifecycle', () => {
  it('is running from construction and start is a no-op', async () => {
    const backend = new HostBackend({ cwd: '/x' })
    expect(backend.status).toBe('running')
    await expect(backend.start()).resolves.toBeUndefined()
    expect(backend.status).toBe('running')
  })

  it('dispose is a no-op — the shared host is never torn down on close', async () => {
    const backend = new HostBackend({ cwd: '/x' })
    await expect(backend.dispose()).resolves.toBeUndefined()
    expect(backend.status).toBe('running')
  })
})
