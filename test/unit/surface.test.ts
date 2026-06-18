import { describe, expect, it, vi } from 'vitest'
import type { NativePty, NativePtyOptions, PtyProcess, PtySpawn } from '@main/backend'
import { HostBackend } from '@main/backend/HostBackend'
import { SurfaceRegistry } from '@main/surface/SurfaceRegistry'

/** A controllable in-memory stand-in for a node-pty handle. */
function makeFakeNativePty() {
  const dataListeners: Array<(data: string) => void> = []
  const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = []
  return {
    pid: 4321,
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

describe('HostBackend.spawnPty', () => {
  it('maps a native PTY handle onto the PtyProcess contract', async () => {
    const fake = makeFakeNativePty()
    const calls: Array<{ file: string; args: string[]; options: NativePtyOptions }> = []
    const spawn: PtySpawn = (file, args, options) => {
      calls.push({ file, args, options })
      return fake as unknown as NativePty
    }

    const backend = new HostBackend({ cwd: '/work/proj', spawn })
    const proc = await backend.spawnPty({ cols: 100, rows: 40 })

    // Spawned in the workspace cwd with the requested geometry.
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.options.cwd).toBe('/work/proj')
    expect(call.options.cols).toBe(100)
    expect(call.options.rows).toBe(40)
    expect(call.args).toEqual([])

    // write / resize / kill delegate to the native handle.
    proc.write('ls\n')
    expect(fake.written).toEqual(['ls\n'])
    proc.resize(120, 50)
    expect(fake.resizes).toEqual([[120, 50]])
    proc.kill()
    expect(fake.killed).toBe(true)

    // onData forwards chunks; onExit forwards the exit code.
    const chunks: string[] = []
    proc.onData((c) => chunks.push(c))
    fake.emitData('hello')
    expect(chunks).toEqual(['hello'])

    let exitCode: number | null = -1
    proc.onExit((code) => {
      exitCode = code
    })
    fake.emitExit(0)
    expect(exitCode).toBe(0)
  })

  it('honors an explicit shell + cwd override', async () => {
    const calls: Array<{ file: string; options: NativePtyOptions }> = []
    const spawn: PtySpawn = (file, _args, options) => {
      calls.push({ file, options })
      return makeFakeNativePty() as unknown as NativePty
    }
    const backend = new HostBackend({ cwd: '/default', spawn })

    await backend.spawnPty({ cols: 80, rows: 24, shell: '/bin/bash', cwd: '/elsewhere' })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.file).toBe('/bin/bash')
    expect(calls[0]!.options.cwd).toBe('/elsewhere')
  })
})

describe('SurfaceRegistry', () => {
  function fakePtyProcess(id: string): PtyProcess {
    return {
      id,
      write: vi.fn(),
      resize: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
      kill: vi.fn()
    }
  }

  it('registers, looks up, and reports membership', () => {
    const registry = new SurfaceRegistry()
    const pty = fakePtyProcess('p1')

    registry.register('S-1', pty)
    expect(registry.get('S-1')).toBe(pty)
    expect(registry.has('S-1')).toBe(true)
    expect(registry.size).toBe(1)
    expect(registry.get('S-unknown')).toBeUndefined()
  })

  it('dispose kills the PTY and forgets it; second dispose is a no-op', () => {
    const registry = new SurfaceRegistry()
    const pty = fakePtyProcess('p1')
    registry.register('S-1', pty)

    expect(registry.dispose('S-1')).toBe(true)
    expect(pty.kill).toHaveBeenCalledTimes(1)
    expect(registry.has('S-1')).toBe(false)
    expect(registry.dispose('S-1')).toBe(false)
  })

  it('delete removes the entry without killing (PTY already exited)', () => {
    const registry = new SurfaceRegistry()
    const pty = fakePtyProcess('p1')
    registry.register('S-1', pty)

    registry.delete('S-1')
    expect(registry.has('S-1')).toBe(false)
    expect(pty.kill).not.toHaveBeenCalled()
  })

  it('disposeAll kills every registered PTY', () => {
    const registry = new SurfaceRegistry()
    const a = fakePtyProcess('a')
    const b = fakePtyProcess('b')
    registry.register('S-a', a)
    registry.register('S-b', b)

    registry.disposeAll()

    expect(a.kill).toHaveBeenCalledTimes(1)
    expect(b.kill).toHaveBeenCalledTimes(1)
    expect(registry.size).toBe(0)
  })
})
