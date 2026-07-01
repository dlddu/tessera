import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Capture ipcMain.handle registrations so the handlers can be invoked directly.
const handlers = vi.hoisted(() => new Map<string, (event: unknown, req: unknown) => unknown>())
vi.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, handler: (event: unknown, req: unknown) => unknown) {
      handlers.set(channel, handler)
    }
  }
}))

import { IpcChannels } from '@shared/ipc'
import type { DirEntry } from '@shared/types'
import type { ContainerRuntime } from '@main/backend'
import { BackendRegistry } from '@main/backend/BackendRegistry'
import { ContainerBackend } from '@main/backend/ContainerBackend'
import { HostBackend } from '@main/backend/HostBackend'
import { registerBackendIpc } from '@main/backend/registerBackendIpc'

describe('HostBackend file IO', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-fileio-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('readFile returns the file contents (UTF-8 round-trips)', async () => {
    const backend = new HostBackend({ cwd: dir })
    await writeFile(join(dir, 'hello.txt'), 'héllo, 월드')

    const bytes = await backend.readFile(join(dir, 'hello.txt'))
    expect(new TextDecoder().decode(bytes)).toBe('héllo, 월드')
  })

  it('readFile resolves a relative path against the workspace cwd', async () => {
    const backend = new HostBackend({ cwd: dir })
    await writeFile(join(dir, 'rel.txt'), 'relative')

    const bytes = await backend.readFile('rel.txt')
    expect(new TextDecoder().decode(bytes)).toBe('relative')
  })

  it('writeFile persists bytes to disk', async () => {
    const backend = new HostBackend({ cwd: dir })
    await backend.writeFile(join(dir, 'out.txt'), new TextEncoder().encode('saved!'))

    expect(await readFile(join(dir, 'out.txt'), 'utf8')).toBe('saved!')
  })

  it('listDir returns entries with directory flags', async () => {
    const backend = new HostBackend({ cwd: dir })
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'f.txt'), 'x')

    const entries = await backend.listDir(dir)

    expect(entries).toHaveLength(2)
    expect(entries).toContainEqual({ name: 'sub', isDir: true })
    expect(entries).toContainEqual({ name: 'f.txt', isDir: false })
  })

  it('listDir resolves a relative path against the workspace cwd', async () => {
    const backend = new HostBackend({ cwd: dir })
    await mkdir(join(dir, 'nested'))
    await writeFile(join(dir, 'nested', 'inner.txt'), 'x')

    expect(await backend.listDir('nested')).toEqual([{ name: 'inner.txt', isDir: false }])
  })
})

describe('ContainerBackend file IO delegates to the machine runtime', () => {
  /** Runtime fake that records file ops; the machine ops are never used here. */
  function fakeRuntime() {
    const calls = {
      readFile: [] as Array<{ name: string; path: string }>,
      writeFile: [] as Array<{ name: string; path: string; data: Uint8Array }>,
      listDir: [] as Array<{ name: string; path: string }>
    }
    const runtime: ContainerRuntime = {
      async ensureSystem() {},
      async createMachine() {},
      async status() {
        return 'running'
      },
      spawnExecPty() {
        throw new Error('not used in this test')
      },
      async readFile(name, path) {
        calls.readFile.push({ name, path })
        return new TextEncoder().encode('guest bytes')
      },
      async writeFile(name, path, data) {
        calls.writeFile.push({ name, path, data })
      },
      async listDir(name, path) {
        calls.listDir.push({ name, path })
        return [{ name: 'src', isDir: true }] satisfies DirEntry[]
      }
    }
    return { runtime, calls }
  }

  function makeBackend() {
    const { runtime, calls } = fakeRuntime()
    const backend = new ContainerBackend({
      name: 'ws-c',
      image: 'node:22',
      homeMount: 'rw',
      runtime
    })
    return { backend, calls }
  }

  it('readFile targets the workspace machine by name', async () => {
    const { backend, calls } = makeBackend()

    const bytes = await backend.readFile('/etc/hostname')

    expect(calls.readFile).toEqual([{ name: 'ws-c', path: '/etc/hostname' }])
    expect(new TextDecoder().decode(bytes)).toBe('guest bytes')
  })

  it('writeFile forwards the exact bytes to the machine', async () => {
    const { backend, calls } = makeBackend()
    const data = new TextEncoder().encode('저장!')

    await backend.writeFile('/srv/a.ts', data)

    expect(calls.writeFile).toEqual([{ name: 'ws-c', path: '/srv/a.ts', data }])
  })

  it('listDir returns the machine listing', async () => {
    const { backend, calls } = makeBackend()

    const entries = await backend.listDir('/srv')

    expect(calls.listDir).toEqual([{ name: 'ws-c', path: '/srv' }])
    expect(entries).toEqual([{ name: 'src', isDir: true }])
  })
})

describe('backend file IPC handlers', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-fileipc-'))
    handlers.clear()
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function register(): void {
    const backends = new BackendRegistry(
      (config) => new HostBackend({ cwd: config.cwd }),
      () => {
        throw new Error('container backend not used in this test')
      }
    )
    backends.create('ws-1', { kind: 'host', cwd: dir })
    registerBackendIpc({ backends })
  }

  it('backend.readFile round-trips file bytes as base64', async () => {
    register()
    await writeFile(join(dir, 'a.ts'), 'const x = 1\n')

    const handler = handlers.get(IpcChannels.backend.readFile)!
    const result = (await handler(
      {},
      { workspaceId: 'ws-1', areaId: 'area-default', path: join(dir, 'a.ts') }
    )) as { dataBase64: string }

    expect(Buffer.from(result.dataBase64, 'base64').toString('utf8')).toBe('const x = 1\n')
  })

  it('backend.writeFile decodes base64 to disk', async () => {
    register()

    const handler = handlers.get(IpcChannels.backend.writeFile)!
    await handler(
      {},
      {
        workspaceId: 'ws-1',
        areaId: 'area-default',
        path: join(dir, 'b.ts'),
        dataBase64: Buffer.from('written', 'utf8').toString('base64')
      }
    )

    expect(await readFile(join(dir, 'b.ts'), 'utf8')).toBe('written')
  })

  it('backend.listDir round-trips structured entries', async () => {
    register()
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'c.ts'), 'x')

    const handler = handlers.get(IpcChannels.backend.listDir)!
    const result = (await handler(
      {},
      { workspaceId: 'ws-1', areaId: 'area-default', path: dir }
    )) as { entries: DirEntry[] }

    expect(result.entries).toHaveLength(2)
    expect(result.entries).toContainEqual({ name: 'sub', isDir: true })
    expect(result.entries).toContainEqual({ name: 'c.ts', isDir: false })
  })

  it('rejects when the workspace has no backend', async () => {
    register()
    const handler = handlers.get(IpcChannels.backend.readFile)!

    await expect(
      handler({}, { workspaceId: 'ghost', areaId: 'area-default', path: join(dir, 'a.ts') })
    ).rejects.toThrow(/no backend/)
  })

  it('backend.listDir rejects when the workspace has no backend', async () => {
    register()
    const handler = handlers.get(IpcChannels.backend.listDir)!

    await expect(
      handler({}, { workspaceId: 'ghost', areaId: 'area-default', path: dir })
    ).rejects.toThrow(/no backend/)
  })
})
