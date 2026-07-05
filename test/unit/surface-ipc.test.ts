import { describe, expect, it, vi } from 'vitest'

// Capture ipcMain.handle registrations so the create handler can be invoked
// directly; `on` (ptyInput/ptyResize) is a no-op here.
const handlers = vi.hoisted(() => new Map<string, (event: unknown, req: unknown) => unknown>())
vi.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, handler: (event: unknown, req: unknown) => unknown) {
      handlers.set(channel, handler)
    },
    on() {}
  }
}))

import { IpcChannels } from '@shared/ipc'
import { DEFAULT_AREA_ID } from '@shared/types'
import type { Backend, PtyProcess } from '@main/backend'
import { BackendRegistry } from '@main/backend/BackendRegistry'
import { registerSurfaceIpc } from '@main/surface/registerSurfaceIpc'

/** A sentinel PtyProcess whose listeners are never fired (the handler just registers them). */
function fakePty(id: string): PtyProcess {
  return {
    id,
    write: () => {},
    resize: () => {},
    onData: () => {},
    onExit: () => {},
    kill: () => {}
  }
}

/** A renderer event whose sender is alive (so the data/exit wiring is harmless). */
function fakeEvent() {
  return { sender: { isDestroyed: () => false, send: vi.fn() } }
}

describe('surface.create resolves the backend by area (AC2.4)', () => {
  /** One host backend registered under ws-1's default area; records spawn options. */
  function setup() {
    const spawned: Array<{ cols: number; rows: number; cwd?: string }> = []
    const backend = {
      kind: 'host',
      status: 'running',
      start: async () => {},
      spawnPty: async (options: { cols: number; rows: number; cwd?: string }) => {
        spawned.push(options)
        return fakePty('pty-1')
      }
    } as unknown as Backend
    const registry = new BackendRegistry(
      () => backend,
      () => backend
    )
    registry.create('ws-1', { kind: 'host', cwd: '/x' })
    registerSurfaceIpc({ backends: registry })
    return { spawned }
  }

  it('spawns a terminal against the default-area backend', async () => {
    const { spawned } = setup()
    const handler = handlers.get(IpcChannels.surface.create)!

    const result = (await handler(fakeEvent(), {
      workspaceId: 'ws-1',
      areaId: DEFAULT_AREA_ID,
      surface: 'terminal'
    })) as { surfaceId: string }

    expect(result.surfaceId).toMatch(/^S-/)
    expect(spawned).toHaveLength(1)
  })

  it('rejects a surface for an unmapped area — no fallback to the default backend', async () => {
    setup()
    const handler = handlers.get(IpcChannels.surface.create)!

    // An area with no registered backend must not quietly borrow the default's —
    // that is the "no backend mixing inside an area" guarantee (AC2.4).
    await expect(
      handler(fakeEvent(), { workspaceId: 'ws-1', areaId: 'area-host', surface: 'terminal' })
    ).rejects.toThrow(/no backend for area/)
  })

  it('rejects a surface for an unknown workspace', async () => {
    setup()
    const handler = handlers.get(IpcChannels.surface.create)!

    await expect(
      handler(fakeEvent(), { workspaceId: 'ghost', areaId: DEFAULT_AREA_ID, surface: 'terminal' })
    ).rejects.toThrow(/no backend for workspace/)
  })
})
