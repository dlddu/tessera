import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
import { BackendRegistry } from '@main/backend/BackendRegistry'
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
    const backends = new BackendRegistry((cwd) => new HostBackend({ cwd }))
    backends.create('ws-1', dir)
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

  it('rejects when the workspace has no backend', async () => {
    register()
    const handler = handlers.get(IpcChannels.backend.readFile)!

    await expect(
      handler({}, { workspaceId: 'ghost', areaId: 'area-default', path: join(dir, 'a.ts') })
    ).rejects.toThrow(/no backend/)
  })
})
