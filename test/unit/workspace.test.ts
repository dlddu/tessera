import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

    // Snapshot is empty-of-content but layout-complete.
    expect(snapshot.surfaces).toEqual([])
    expect(snapshot.workspaceId).toBe(workspace.id)
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
})
