import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('surface.create pushes the live process name as the tab title', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A PtyProcess whose foreground-process name and exit can be driven from the test. */
  function controllablePty(initial: string) {
    let processName = initial
    let onExit: ((code: number | null) => void) | null = null
    const pty: PtyProcess = {
      id: 'pty-1',
      get process() {
        return processName
      },
      write: () => {},
      resize: () => {},
      onData: () => {},
      onExit: (listener) => {
        onExit = listener
      },
      kill: () => {}
    }
    return {
      pty,
      setProcess: (name: string) => {
        processName = name
      },
      exit: (code: number | null) => onExit?.(code)
    }
  }

  /** Register the surface IPC over a single host backend that hands out `pty`. */
  function setup(pty: PtyProcess) {
    const backend = {
      kind: 'host',
      status: 'running',
      start: async () => {},
      spawnPty: async () => pty
    } as unknown as Backend
    const registry = new BackendRegistry(
      () => backend,
      () => backend
    )
    registry.create('ws-1', { kind: 'host', cwd: '/x' })
    registerSurfaceIpc({ backends: registry })
    return handlers.get(IpcChannels.surface.create)!
  }

  it('emits ptyTitle on the first poll and again only when the process changes', async () => {
    vi.useFakeTimers()
    const control = controllablePty('zsh')
    const handler = setup(control.pty)
    const event = fakeEvent()
    await handler(event, { workspaceId: 'ws-1', areaId: DEFAULT_AREA_ID, surface: 'terminal' })
    const send = event.sender.send

    // First tick corrects the tab to the real shell name (even if it matched the
    // default, this is where a differing shell — e.g. bash — would sync).
    vi.advanceTimersByTime(1000)
    expect(send).toHaveBeenCalledWith(IpcChannels.surface.ptyTitle, {
      surfaceId: expect.stringMatching(/^S-/),
      title: 'zsh'
    })

    // Unchanged name → no churn, so the renderer isn't re-titled every second.
    send.mockClear()
    vi.advanceTimersByTime(1000)
    expect(send).not.toHaveBeenCalled()

    // Running a program flips the foreground process → a fresh title is pushed.
    control.setProcess('vim')
    vi.advanceTimersByTime(1000)
    expect(send).toHaveBeenCalledWith(IpcChannels.surface.ptyTitle, {
      surfaceId: expect.stringMatching(/^S-/),
      title: 'vim'
    })
  })

  it('stops polling once the PTY exits', async () => {
    vi.useFakeTimers()
    const control = controllablePty('zsh')
    const handler = setup(control.pty)
    const event = fakeEvent()
    await handler(event, { workspaceId: 'ws-1', areaId: DEFAULT_AREA_ID, surface: 'terminal' })
    const send = event.sender.send

    control.exit(0)
    control.setProcess('vim')
    send.mockClear()
    vi.advanceTimersByTime(5000)
    expect(send).not.toHaveBeenCalledWith(IpcChannels.surface.ptyTitle, expect.anything())
  })

  it('never polls a PTY that exposes no process name (container exec terminal)', async () => {
    vi.useFakeTimers()
    // fakePty has no `process` getter — the mirror of a container exec PTY, whose
    // host-side process is the `container` CLI, not the guest shell.
    const handler = setup(fakePty('pty-c'))
    const event = fakeEvent()
    await handler(event, { workspaceId: 'ws-1', areaId: DEFAULT_AREA_ID, surface: 'terminal' })
    const send = event.sender.send

    vi.advanceTimersByTime(5000)
    expect(send).not.toHaveBeenCalledWith(IpcChannels.surface.ptyTitle, expect.anything())
  })
})
