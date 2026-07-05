import { describe, expect, it } from 'vitest'
import { DEFAULT_AREA_ID } from '@shared/types'
import type { Backend } from '@main/backend'
import { BackendRegistry } from '@main/backend/BackendRegistry'

/**
 * M-J2-S7 (AC2.7) — the backend registry's host-area seam. A container
 * workspace's optional host-only area registers a *second*, host backend under
 * its own area id (`addArea`) and drops it again on close (`removeArea`), while
 * the workspace's default (container) backend stays put — so an area's panes
 * never borrow another area's backend (AC2.4/AC2.8). Kept in its own file (a
 * main-process test) so the suite doesn't mix renderer + main imports.
 */
describe('BackendRegistry host area (AC2.7)', () => {
  const stub = (kind: string): Backend =>
    ({ kind, status: 'running', start: async () => {} }) as unknown as Backend

  function registry(): BackendRegistry {
    const reg = new BackendRegistry(
      () => stub('host'),
      () => stub('container')
    )
    reg.create('ws-1', { kind: 'container', image: 'node:22', homeMount: 'rw' })
    return reg
  }

  it('addArea registers a host backend resolvable under its own area id', () => {
    const reg = registry()
    reg.addArea('ws-1', 'area-host', { kind: 'host', cwd: '/Users/dev' })

    // The host area resolves to a HOST backend; the default area still resolves
    // to the workspace's own (container) backend — no mixing (AC2.4).
    expect(reg.resolve('ws-1', 'area-host').kind).toBe('host')
    expect(reg.resolve('ws-1', DEFAULT_AREA_ID).kind).toBe('container')
  })

  it('removeArea drops only the host area, leaving the default one intact', () => {
    const reg = registry()
    reg.addArea('ws-1', 'area-host', { kind: 'host', cwd: '/Users/dev' })
    reg.removeArea('ws-1', 'area-host')

    // The closed host area no longer resolves (its panes can't borrow another
    // backend, AC2.8), but the container default area is untouched.
    expect(() => reg.resolve('ws-1', 'area-host')).toThrow(/no backend for area/)
    expect(reg.resolve('ws-1', DEFAULT_AREA_ID).kind).toBe('container')
  })

  it('removeArea is idempotent (closing an absent area is a no-op)', () => {
    const reg = registry()
    expect(() => reg.removeArea('ws-1', 'area-host')).not.toThrow()
    expect(() => reg.removeArea('ghost', 'area-host')).not.toThrow()
  })

  it('addArea rejects a workspace with no default backend (no invented workspace)', () => {
    const reg = registry()
    expect(() => reg.addArea('ghost', 'area-host', { kind: 'host', cwd: '/x' })).toThrow(
      /no backend for workspace/
    )
  })
})
