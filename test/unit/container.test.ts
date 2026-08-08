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
import { DEFAULT_AREA_ID } from '@shared/types'
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
function fakeRuntime(opts: { failCreate?: boolean; failStop?: boolean; failBoot?: boolean } = {}) {
  const calls = {
    ensureSystem: 0,
    createMachine: [] as CreateMachineSpec[],
    spawnExecPty: [] as Array<{ name: string; options: ExecPtyOptions }>,
    readFile: [] as Array<{ name: string; path: string }>,
    writeFile: [] as Array<{ name: string; path: string; data: Uint8Array }>,
    listDir: [] as Array<{ name: string; path: string }>,
    installBrowserShim: [] as Array<{ name: string; contents: string }>,
    stopMachine: [] as string[],
    bootMachine: [] as string[],
    removeMachine: [] as string[]
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
    },
    async installBrowserShim(name, contents) {
      calls.installBrowserShim.push({ name, contents })
      return '/home/dev/.local/bin/tessera-open'
    },
    async stopMachine(name) {
      calls.stopMachine.push(name)
      if (opts.failStop) throw new ContainerRuntimeUnavailableError('stop failed')
    },
    async bootMachine(name) {
      calls.bootMachine.push(name)
      if (opts.failBoot) throw new ContainerRuntimeUnavailableError('boot failed')
    },
    async removeMachine(name) {
      calls.removeMachine.push(name)
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
    // Two OSC 7 hooks: PROMPT_COMMAND (bash) then PS1 (sh); no --workdir.
    expect(spawned[0]!.args).toEqual([
      'machine',
      'run',
      '-n',
      'ws-7',
      '--env',
      expect.stringContaining('PROMPT_COMMAND='),
      '--env',
      expect.stringContaining('PS1=')
    ])
  })

  it('appends each guest env var as a --env K=V after the cwd hooks (AC2.4)', async () => {
    const { runtime, spawned } = spyingRuntime()

    await runtime.spawnExecPty('ws-7', {
      cols: 80,
      rows: 24,
      env: { TESSERA_BACKEND: 'container' }
    })

    // The OSC 7 hooks come first, then the explicit guest vars — both machine-
    // side only, so no host env crosses in.
    expect(spawned[0]!.args).toEqual([
      'machine',
      'run',
      '-n',
      'ws-7',
      '--env',
      expect.stringContaining('PROMPT_COMMAND='),
      '--env',
      expect.stringContaining('PS1='),
      '--env',
      'TESSERA_BACKEND=container'
    ])
  })

  it('passes an explicit cwd through as --workdir, before the --env hooks', async () => {
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
      expect.stringContaining('PROMPT_COMMAND='),
      '--env',
      expect.stringContaining('PS1=')
    ])
  })

  it('emits OSC 7 cwd + OSC 2 title reports for both bash (PROMPT_COMMAND) and sh (PS1)', async () => {
    const { runtime, spawned } = spyingRuntime()
    await runtime.spawnExecPty('ws-7', { cols: 80, rows: 24 })

    const args = spawned[0]!.args
    const promptCommand = args.find((a) => a.startsWith('PROMPT_COMMAND='))!
    const ps1 = args.find((a) => a.startsWith('PS1='))!

    // bash: printf interprets `\033` into ESC at runtime, so the literal carries
    // `\033`, and it reports the live `$PWD`.
    expect(promptCommand).toContain(']7;file://')
    expect(promptCommand).toContain('$PWD')
    // …plus an OSC 2 shell-name title so a container tab has a live baseline
    // (guest can't be seen by the host process poll).
    expect(promptCommand).toContain(']2;bash')
    // sh: the OSC 7 rides in a `$(printf … >&2)` side effect — printf writes it
    // to the terminal and the substitution captures empty stdout, so it never
    // lands in the counted prompt text (no width miscount → no corrupt redraws).
    expect(ps1).toContain('$(printf')
    expect(ps1).toContain(']7;file://')
    expect(ps1).toContain('$PWD')
    expect(ps1).toContain('>&2')
    // The OSC 2 title rides the same side-effect printf, so it's off the prompt
    // width too.
    expect(ps1).toContain(']2;sh')
    // No raw ESC in the value: the sequences live only in printf's output, not in
    // what sh measures for prompt width.
    expect(ps1).not.toContain('\x1b')
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

  it('installBrowserShim resolves a writable guest dir, installs 3 names, and returns the path', async () => {
    const installed = '/home/silas/.local/bin/tessera-open'
    const { runtime, spawned } = ptyRuntime(() => reply(installed))
    const script = '#!/bin/sh\necho hi\n'

    const path = await runtime.installBrowserShim('ws-9', script)

    // The guest echoes where the shim actually landed → the caller's $BROWSER.
    expect(path).toBe(installed)
    expect(spawned).toHaveLength(1)
    const cmd = scriptOf(spawned[0]!)
    const b64 = Buffer.from(script, 'utf8').toString('base64')
    // Install dir is probed in the guest — first absolute+writable $PATH dir,
    // else ~/.local/bin (a non-root guest can't write /usr/local/bin).
    expect(cmd).toContain('for p in $PATH')
    expect(cmd).toContain('if [ -d "$p" ] && [ -w "$p" ]; then d=$p; break; fi')
    expect(cmd).toContain('[ -n "$d" ] || { d=$HOME/.local/bin; mkdir -p "$d"; }')
    // Decodes tessera-open, copies to xdg-open/open, +x all, echoes the path.
    expect(cmd).toContain(`printf %s '${b64}' | base64 -d > "$d/tessera-open"`)
    expect(cmd).toContain('cp -f "$d/tessera-open" "$d/xdg-open"')
    expect(cmd).toContain('cp -f "$d/tessera-open" "$d/open"')
    expect(cmd).toContain('&& printf %s "$d/tessera-open"')
  })

  it('installBrowserShim rejects when the guest produced no path', async () => {
    const { runtime } = ptyRuntime(() => reply(''))
    await expect(runtime.installBrowserShim('ws-9', '#!/bin/sh\n')).rejects.toThrow(/no path/)
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

    // Only the fixed guest marker is forwarded (AC2.4); the caller's host-env
    // snapshot is dropped, so `SECRET` never reaches the machine.
    expect(calls.spawnExecPty).toEqual([
      {
        name: 'ws-42',
        options: { cols: 100, rows: 40, cwd: '/work', env: { TESSERA_BACKEND: 'container' } }
      }
    ])
    expect(calls.spawnExecPty[0]!.options.env).toEqual({ TESSERA_BACKEND: 'container' })
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

    // cwd is omitted, but the guest backend marker is always set (AC2.4).
    expect(calls.spawnExecPty).toEqual([
      { name: 'ws-1', options: { cols: 80, rows: 24, env: { TESSERA_BACKEND: 'container' } } }
    ])
    expect(calls.spawnExecPty[0]!.options).not.toHaveProperty('cwd')
  })
})

describe('ContainerBackend.spawnPty — routing (direction A, AC3.2)', () => {
  const endpoint = { host: '192.168.64.1', port: 51234, token: 'tok-abc' }

  function routingBackend(routing?: { ensureChannel: (id: string) => Promise<typeof endpoint> }) {
    const { runtime, calls } = fakeRuntime()
    const backend = new ContainerBackend({
      name: 'ws-r',
      image: 'node:22',
      homeMount: 'rw',
      runtime,
      ...(routing ? { routing } : {})
    })
    return { backend, calls }
  }

  it('installs the shim and injects the resolved shim path + endpoint via --env', async () => {
    const ensureChannel = vi.fn(async () => endpoint)
    const { backend, calls } = routingBackend({ ensureChannel })

    await backend.spawnPty({ cols: 80, rows: 24 })

    // The channel is ensured for this workspace and the shim is installed.
    expect(ensureChannel).toHaveBeenCalledWith('ws-r')
    expect(calls.installBrowserShim).toHaveLength(1)
    // The installed shim reads the injected route env …
    expect(calls.installBrowserShim[0]!.contents).toContain('TESSERA_ROUTE_TOKEN')
    // … and auto-detects the host from the container's default gateway
    // (/proc/net/route, no `ip` binary) so it works whatever the subnet.
    expect(calls.installBrowserShim[0]!.contents).toContain('/proc/net/route')
    // BROWSER is the shim's ACTUAL installed path (echoed back by the guest), not
    // a fixed /usr/local/bin a non-root guest couldn't write to.
    expect(calls.spawnExecPty[0]!.options.env).toEqual({
      TESSERA_BACKEND: 'container',
      BROWSER: '/home/dev/.local/bin/tessera-open',
      TESSERA_ROUTE_HOST: '192.168.64.1',
      TESSERA_ROUTE_PORT: '51234',
      TESSERA_ROUTE_TOKEN: 'tok-abc'
    })
  })

  it('ensures the channel + shim once across terminals', async () => {
    const ensureChannel = vi.fn(async () => endpoint)
    const { backend, calls } = routingBackend({ ensureChannel })

    await backend.spawnPty({ cols: 80, rows: 24 })
    await backend.spawnPty({ cols: 80, rows: 24 })

    expect(ensureChannel).toHaveBeenCalledTimes(1)
    expect(calls.installBrowserShim).toHaveLength(1)
    expect(calls.spawnExecPty).toHaveLength(2)
  })

  it('without a routing provider, only the backend marker is set (no route env)', async () => {
    const { backend, calls } = routingBackend()

    await backend.spawnPty({ cols: 80, rows: 24 })

    expect(calls.installBrowserShim).toHaveLength(0)
    expect(calls.spawnExecPty[0]!.options.env).toEqual({ TESSERA_BACKEND: 'container' })
  })

  it('degrades gracefully when the channel cannot be opened (terminal still spawns)', async () => {
    const ensureChannel = vi.fn(async () => {
      throw new Error('bind failed')
    })
    const { backend, calls } = routingBackend({ ensureChannel })

    const proc = await backend.spawnPty({ cols: 80, rows: 24 })

    expect(proc.id).toBe('pty-ws-r')
    expect(calls.installBrowserShim).toHaveLength(0)
    expect(calls.spawnExecPty[0]!.options.env).toEqual({ TESSERA_BACKEND: 'container' })
  })

  it('does NOT set $BROWSER when the shim install fails (no dangling launcher)', async () => {
    // Regression: a non-root guest can't write /usr/local/bin; if the install
    // fails, $BROWSER must NOT be set (a $BROWSER pointing at a missing file
    // breaks every browser-open — worse than none).
    const ensureChannel = vi.fn(async () => endpoint)
    const { runtime, calls } = fakeRuntime()
    runtime.installBrowserShim = vi.fn(async () => {
      throw new Error('read-only fs')
    })
    // The failure is logged for debuggability; silence it in the test.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const backend = new ContainerBackend({
      name: 'ws-r',
      image: 'node:22',
      homeMount: 'rw',
      runtime,
      routing: { ensureChannel }
    })

    const proc = await backend.spawnPty({ cols: 80, rows: 24 })
    errorSpy.mockRestore()

    // Terminal still opens; no BROWSER/route env → the tool falls back to its own
    // behavior (print the URL) and the terminal web-links click is the backup.
    expect(proc.id).toBe('pty-ws-r')
    expect(calls.spawnExecPty[0]!.options.env).toEqual({ TESSERA_BACKEND: 'container' })
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
  const stub = (kind: string): Backend =>
    ({ kind, status: 'stopped', start: async () => {} }) as unknown as Backend

  it('routes host vs container config to the right factory and never starts', () => {
    const started: string[] = []
    const stubStart = (kind: string): Backend =>
      ({
        kind,
        status: 'stopped',
        start: async () => {
          started.push(kind)
        }
      }) as unknown as Backend

    const registry = new BackendRegistry(
      () => stubStart('host'),
      () => stubStart('container')
    )

    const host = registry.create('ws-h', { kind: 'host', cwd: '/x' })
    const cont = registry.create('ws-c', { kind: 'container', image: 'node:22', homeMount: 'rw' })

    expect(host.kind).toBe('host')
    expect(cont.kind).toBe('container')
    // Each workspace's backend registers under its default area and resolves back.
    expect(registry.resolve('ws-h', DEFAULT_AREA_ID)).toBe(host)
    expect(registry.resolve('ws-c', DEFAULT_AREA_ID)).toBe(cont)
    // create() only constructs + registers; it must not boot anything.
    expect(started).toEqual([])
  })

  it('rejects an unknown workspace or an unmapped area — no silent fallback (AC2.4)', () => {
    const registry = new BackendRegistry(
      () => stub('host'),
      () => stub('container')
    )
    registry.create('ws-1', { kind: 'host', cwd: '/x' })

    // Unknown workspace.
    expect(() => registry.resolve('ghost', DEFAULT_AREA_ID)).toThrow(/no backend for workspace/)
    // Known workspace, but an area that was never registered must NOT borrow the
    // default area's backend — that is what forbids backend mixing in an area.
    expect(() => registry.resolve('ws-1', 'area-host')).toThrow(/no backend for area/)
  })

  it('delete drops the whole workspace so later resolves fail', () => {
    const registry = new BackendRegistry(
      () => stub('host'),
      () => stub('container')
    )
    registry.create('ws-1', { kind: 'host', cwd: '/x' })
    expect(registry.resolve('ws-1', DEFAULT_AREA_ID).kind).toBe('host')

    registry.delete('ws-1')

    expect(() => registry.resolve('ws-1', DEFAULT_AREA_ID)).toThrow(/no backend for workspace/)
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
