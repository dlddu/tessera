/**
 * Diagnostics for the layout skeleton's save / restore path (AC1.5).
 *
 * The behaviour under test is deliberately *not* "does it restore" — that is
 * covered in `workspace.test.ts`. It is "when it doesn't restore, does the log
 * say why", because every failure mode in `PersistenceStore` degrades to the
 * same silent null and the same default layout on screen.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PersistenceStore } from '@main/persistence/PersistenceStore'
import type { SnapshotLogger } from '@main/persistence/PersistenceStore'
import { DEFAULT_AREA_ID, buildWorkspaceSnapshot, describeLayout } from '@shared/types'
import type { LayoutSnapshot, Workspace, WorkspaceStateSnapshot } from '@shared/types'

interface Line {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  fields: Record<string, unknown>
}

/** A logger that records instead of writing, so assertions read as log lines. */
function recordingLogger(): { logger: SnapshotLogger; lines: Line[] } {
  const lines: Line[] = []
  const record =
    (level: Line['level']) =>
    (message: string, fields: Record<string, unknown> = {}): void => {
      lines.push({ level, message, fields })
    }
  return {
    lines,
    logger: {
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error')
    }
  }
}

const find = (lines: Line[], fragment: string): Line | undefined =>
  lines.find((line) => line.message.includes(fragment))

const workspace: Workspace = {
  id: 'ws-log',
  name: 'log',
  backend: { kind: 'host', cwd: '/tmp/log' }
}

/** A two-pane skeleton: one split, three tabs, zoomed. */
function layout(): LayoutSnapshot {
  return {
    version: 1,
    workspaceId: workspace.id,
    root: {
      type: 'split',
      id: 'split-1',
      direction: 'vertical',
      sizes: [0.5, 0.5],
      children: [
        {
          type: 'pane',
          id: 'pane-1',
          activeTabId: 'tab-1',
          tabs: [
            { id: 'tab-1', title: 'zsh', surface: 'terminal', areaId: DEFAULT_AREA_ID },
            { id: 'tab-2', title: 'edit', surface: 'editor', areaId: DEFAULT_AREA_ID }
          ]
        },
        {
          type: 'pane',
          id: 'pane-2',
          activeTabId: 'tab-3',
          tabs: [{ id: 'tab-3', title: 'web', surface: 'browser', areaId: DEFAULT_AREA_ID }]
        }
      ]
    },
    areas: [{ id: DEFAULT_AREA_ID, kind: 'default', backend: 'host' }],
    focusedPaneId: 'pane-1',
    zoomedPaneId: 'pane-1'
  }
}

const snapshot = (): WorkspaceStateSnapshot =>
  buildWorkspaceSnapshot(workspace, layout(), Date.now())

describe('describeLayout', () => {
  it('counts panes, tabs, splits and areas, and reports zoom', () => {
    expect(describeLayout(layout())).toEqual({
      panes: 2,
      tabs: 3,
      splits: 1,
      areas: 1,
      zoomed: true
    })
  })

  it('never leaks tab content — only counts', () => {
    const withPath = layout()
    const pane = (withPath.root as { children: { tabs: { path?: string }[] }[] }).children[0]!
    pane.tabs[1]!.path = '/Users/me/secret-project/notes.md'

    expect(JSON.stringify(describeLayout(withPath))).not.toContain('secret-project')
  })

  it('yields zeros for a garbled tree rather than throwing', () => {
    const garbled = { areas: null, root: { type: 'pane', tabs: 'not-an-array' } }
    expect(() => describeLayout(garbled as unknown as LayoutSnapshot)).not.toThrow()
    expect(describeLayout(null)).toEqual({ panes: 0, tabs: 0, splits: 0, areas: 0, zoomed: false })
  })
})

describe('PersistenceStore diagnostics', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'tessera-persist-log-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('logs the shape a save carried, not its content', async () => {
    const { logger, lines } = recordingLogger()
    await new PersistenceStore(baseDir, logger).save(snapshot())

    const saved = find(lines, 'saved')
    expect(saved?.level).toBe('debug')
    expect(saved?.fields).toMatchObject({ workspaceId: 'ws-log', panes: 2, tabs: 3, zoomed: true })
    expect(saved?.fields['bytes']).toBeGreaterThan(0)
  })

  it('marks the quit flush at info — the last write of the session', () => {
    const { logger, lines } = recordingLogger()
    new PersistenceStore(baseDir, logger).saveSync(snapshot())

    const flushed = find(lines, 'flushed on quit')
    expect(flushed?.level).toBe('info')
    expect(flushed?.fields).toMatchObject({ sync: true, panes: 2 })
  })

  it('reports a missing file as an ordinary debug, not a fault', async () => {
    const { logger, lines } = recordingLogger()
    expect(await new PersistenceStore(baseDir, logger).load('never-saved')).toBeNull()

    expect(find(lines, 'no layout snapshot')?.level).toBe('debug')
    expect(lines.some((line) => line.level === 'warn')).toBe(false)
  })

  it.each([
    ['malformed', '{ not json'],
    ['unmigratable', JSON.stringify({ version: 1, workspaceId: 'ws-log' })],
    ['invalid', JSON.stringify({ version: 3, workspaceId: 'ws-log', layout: {} })]
  ])('warns with reason "%s" when a present file cannot restore', async (reason, raw) => {
    const { logger, lines } = recordingLogger()
    await mkdir(join(baseDir, 'workspaces'), { recursive: true })
    await writeFile(join(baseDir, 'workspaces', 'ws-log.json'), raw, 'utf8')

    expect(await new PersistenceStore(baseDir, logger).load('ws-log')).toBeNull()

    const rejected = find(lines, 'rejected')
    expect(rejected?.level).toBe('warn')
    expect(rejected?.fields['reason']).toBe(reason)
  })

  it('records the migration when an older snapshot is upgraded', async () => {
    const { logger, lines } = recordingLogger()
    const store = new PersistenceStore(baseDir, logger)
    await store.save(snapshot())

    // Rewrite the file as a v2 (pre-zoom) snapshot, the shape the migrator exists for.
    const file = join(baseDir, 'workspaces', 'ws-log.json')
    const v2 = { ...snapshot(), version: 2, layout: { ...layout(), zoomedPaneId: undefined } }
    await writeFile(file, JSON.stringify(v2), 'utf8')

    expect(await store.load('ws-log')).not.toBeNull()
    expect(find(lines, 'restored')?.fields).toMatchObject({ migratedFrom: 2, to: 3 })
  })

  it('summarizes a boot scan with what was restored and what was skipped', async () => {
    const { logger, lines } = recordingLogger()
    const store = new PersistenceStore(baseDir, logger)
    await store.save(snapshot())
    await writeFile(join(baseDir, 'workspaces', 'broken.json'), 'nope', 'utf8')

    expect(await store.list()).toHaveLength(1)

    const scan = find(lines, 'boot restore scan')
    expect(scan?.level).toBe('info')
    expect(scan?.fields).toMatchObject({ restored: 1, skipped: 1, activate: 'ws-log' })
    expect(scan?.fields['skippedIds']).toEqual(['broken'])
  })

  it('reports an empty store as a first run rather than silence', async () => {
    const { logger, lines } = recordingLogger()
    expect(await new PersistenceStore(baseDir, logger).list()).toEqual([])
    expect(find(lines, 'first run')?.level).toBe('info')
  })

  it('logs and rethrows a failed write instead of losing it', async () => {
    const { logger, lines } = recordingLogger()
    // `workspaces` as a *file* makes mkdir/write fail the way a permissions or
    // disk problem would, without mocking fs.
    await writeFile(join(baseDir, 'workspaces'), 'blocked', 'utf8')

    await expect(new PersistenceStore(baseDir, logger).save(snapshot())).rejects.toThrow()
    expect(find(lines, 'save failed')?.level).toBe('error')
  })
})
