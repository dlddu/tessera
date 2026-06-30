import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WORKSPACE_SNAPSHOT_VERSION } from '@shared/types'
import type { LayoutNode, PaneNode, WorkspaceStateSnapshot } from '@shared/types'
import { buildWorkspace, validateWorkspaceInput } from '@shared/workspace'
import { PersistenceStore } from '@main/persistence/PersistenceStore'

function panes(node: LayoutNode): PaneNode[] {
  return node.type === 'pane' ? [node] : node.children.flatMap(panes)
}

describe('validateWorkspaceInput', () => {
  it('requires a non-empty name', () => {
    expect(validateWorkspaceInput({ name: '  ', cwd: '/tmp', backendKind: 'host' })).not.toBeNull()
  })

  it('requires a cwd for host workspaces', () => {
    expect(validateWorkspaceInput({ name: 'x', cwd: '  ', backendKind: 'host' })).not.toBeNull()
  })

  it('rejects container creation (out of scope)', () => {
    expect(
      validateWorkspaceInput({ name: 'x', cwd: '/tmp', backendKind: 'container' })
    ).not.toBeNull()
  })

  it('accepts a valid host input', () => {
    expect(validateWorkspaceInput({ name: 'proj', cwd: '/tmp', backendKind: 'host' })).toBeNull()
  })
})

describe('buildWorkspace', () => {
  it('builds a host workspace with a single-pane terminal layout', () => {
    const { workspace, layout, snapshot } = buildWorkspace({
      name: '  proj-web  ',
      cwd: '  /home/me/proj-web  ',
      backendKind: 'host'
    })

    // Trimmed name + host backend bound to the cwd.
    expect(workspace.name).toBe('proj-web')
    expect(workspace.backend).toEqual({ kind: 'host', cwd: '/home/me/proj-web' })
    expect(workspace.id).toMatch(/^ws-/)

    // Single pane root with exactly one terminal tab.
    const allPanes = panes(layout.root)
    expect(allPanes).toHaveLength(1)
    expect(layout.root.type).toBe('pane')
    expect(allPanes[0]?.tabs).toHaveLength(1)
    expect(allPanes[0]?.tabs[0]?.surface).toBe('terminal')
    expect(layout.focusedPaneId).toBe(allPanes[0]?.id)
    expect(layout.workspaceId).toBe(workspace.id)
    expect(layout.areas).toEqual([{ id: 'area-default', kind: 'default', backend: 'host' }])

    // Snapshot is empty-of-content but layout-complete, and carries the full
    // workspace identity (id, name, backend cwd) so restore can rebuild it.
    expect(snapshot.version).toBe(WORKSPACE_SNAPSHOT_VERSION)
    expect(snapshot.surfaces).toEqual([])
    expect(snapshot.workspaceId).toBe(workspace.id)
    expect(snapshot.workspace).toBe(workspace)
    expect(snapshot.layout).toBe(layout)
    expect(snapshot.savedAt).toBeGreaterThan(0)
  })

  it('throws on invalid input', () => {
    expect(() => buildWorkspace({ name: '', cwd: '/tmp', backendKind: 'host' })).toThrow()
  })
})

describe('PersistenceStore.save', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'tessera-persist-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('writes a workspace snapshot that round-trips through JSON', async () => {
    const { snapshot } = buildWorkspace({ name: 'proj', cwd: '/tmp/proj', backendKind: 'host' })
    const store = new PersistenceStore(baseDir)

    await store.save(snapshot)

    const target = join(baseDir, 'workspaces', `${snapshot.workspaceId}.json`)
    const parsed = JSON.parse(await readFile(target, 'utf8')) as WorkspaceStateSnapshot
    expect(parsed).toEqual(snapshot)
  })

  it('saveSync writes a snapshot that load reads back', async () => {
    const { snapshot } = buildWorkspace({ name: 'sync', cwd: '/tmp/sync', backendKind: 'host' })
    const store = new PersistenceStore(baseDir)

    store.saveSync(snapshot)

    expect(await store.load(snapshot.workspaceId)).toEqual(snapshot)
  })
})

describe('PersistenceStore.delete', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'tessera-persist-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('permanently removes one snapshot (gone from load + list) but leaves siblings', async () => {
    const store = new PersistenceStore(baseDir)
    const { snapshot: keep } = buildWorkspace({
      name: 'keep',
      cwd: '/tmp/keep',
      backendKind: 'host'
    })
    const { snapshot: drop } = buildWorkspace({
      name: 'drop',
      cwd: '/tmp/drop',
      backendKind: 'host'
    })
    await store.save(keep)
    await store.save(drop)

    await store.delete(drop.workspaceId)

    expect(await store.load(drop.workspaceId)).toBeNull()
    const ids = (await store.list()).map((s) => s.workspaceId)
    expect(ids).toContain(keep.workspaceId)
    expect(ids).not.toContain(drop.workspaceId)
  })

  it('is idempotent when the workspace was never saved', async () => {
    const store = new PersistenceStore(baseDir)
    await expect(store.delete('ws-never')).resolves.toBeUndefined()
  })
})

describe('PersistenceStore.load', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'tessera-persist-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('reads back a saved snapshot', async () => {
    const { snapshot } = buildWorkspace({ name: 'proj', cwd: '/tmp/proj', backendKind: 'host' })
    const store = new PersistenceStore(baseDir)
    await store.save(snapshot)

    expect(await store.load(snapshot.workspaceId)).toEqual(snapshot)
  })

  it('returns null when the workspace file is absent', async () => {
    const store = new PersistenceStore(baseDir)
    expect(await store.load('ws-missing')).toBeNull()
  })

  it('returns null for malformed JSON rather than throwing', async () => {
    const store = new PersistenceStore(baseDir)
    await mkdir(join(baseDir, 'workspaces'), { recursive: true })
    await writeFile(join(baseDir, 'workspaces', 'ws-bad.json'), '{ not valid json', 'utf8')

    expect(await store.load('ws-bad')).toBeNull()
  })

  it('discards a snapshot whose version has no migration path', async () => {
    const { snapshot } = buildWorkspace({ name: 'old', cwd: '/tmp/old', backendKind: 'host' })
    const store = new PersistenceStore(baseDir)
    await mkdir(join(baseDir, 'workspaces'), { recursive: true })
    // version 1 predates the migrator chain (which starts at v2) → unrecoverable.
    await writeFile(
      join(baseDir, 'workspaces', `${snapshot.workspaceId}.json`),
      JSON.stringify({ ...snapshot, version: 1 }),
      'utf8'
    )

    expect(await store.load(snapshot.workspaceId)).toBeNull()
  })

  it('discards a snapshot from a newer, unknown schema version', async () => {
    const { snapshot } = buildWorkspace({ name: 'future', cwd: '/tmp/future', backendKind: 'host' })
    const store = new PersistenceStore(baseDir)
    await mkdir(join(baseDir, 'workspaces'), { recursive: true })
    await writeFile(
      join(baseDir, 'workspaces', `${snapshot.workspaceId}.json`),
      JSON.stringify({ ...snapshot, version: WORKSPACE_SNAPSHOT_VERSION + 1 }),
      'utf8'
    )

    expect(await store.load(snapshot.workspaceId)).toBeNull()
  })

  it('migrates a pre-zoom (v2) snapshot, seeding zoomedPaneId = null', async () => {
    const { snapshot } = buildWorkspace({ name: 'v2', cwd: '/tmp/v2', backendKind: 'host' })
    const store = new PersistenceStore(baseDir)
    await mkdir(join(baseDir, 'workspaces'), { recursive: true })

    // A genuine J1-S6 (v2) file: no zoom field anywhere, version 2.
    const { zoomedPaneId: _omit, ...layoutWithoutZoom } = snapshot.layout
    const legacy = { ...snapshot, version: 2, layout: layoutWithoutZoom }
    await writeFile(
      join(baseDir, 'workspaces', `${snapshot.workspaceId}.json`),
      JSON.stringify(legacy),
      'utf8'
    )

    const loaded = await store.load(snapshot.workspaceId)
    expect(loaded).not.toBeNull()
    // Upgraded to the current schema, with zoom defaulted off and the layout
    // skeleton otherwise preserved.
    expect(loaded!.version).toBe(WORKSPACE_SNAPSHOT_VERSION)
    expect(loaded!.layout.zoomedPaneId).toBeNull()
    expect(loaded!.layout.root).toEqual(snapshot.layout.root)
    expect(loaded!.workspace).toEqual(snapshot.workspace)
  })

  it('preserves an active zoom across a current-version round-trip (restart)', async () => {
    const { snapshot } = buildWorkspace({ name: 'zoom', cwd: '/tmp/zoom', backendKind: 'host' })
    const store = new PersistenceStore(baseDir)
    // Persist a snapshot with a pane zoomed (the focused single pane).
    const zoomed = {
      ...snapshot,
      layout: { ...snapshot.layout, zoomedPaneId: snapshot.layout.focusedPaneId }
    }
    await store.save(zoomed)

    const loaded = await store.load(snapshot.workspaceId)
    expect(loaded!.layout.zoomedPaneId).toBe(snapshot.layout.focusedPaneId)
  })
})

describe('PersistenceStore.list', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'tessera-persist-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('returns an empty list when nothing has been persisted', async () => {
    const store = new PersistenceStore(baseDir)
    expect(await store.list()).toEqual([])
  })

  it('returns every valid snapshot newest-first, skipping corrupt files', async () => {
    const store = new PersistenceStore(baseDir)
    const older = buildWorkspace({ name: 'older', cwd: '/tmp/older', backendKind: 'host' }).snapshot
    const newer = buildWorkspace({ name: 'newer', cwd: '/tmp/newer', backendKind: 'host' }).snapshot
    older.savedAt = 1000
    newer.savedAt = 2000
    await store.save(older)
    await store.save(newer)
    // A corrupt entry alongside the good ones must be skipped, not throw.
    await writeFile(join(baseDir, 'workspaces', 'ws-broken.json'), 'not json', 'utf8')

    const list = await store.list()
    expect(list.map((s) => s.workspaceId)).toEqual([newer.workspaceId, older.workspaceId])
  })
})
