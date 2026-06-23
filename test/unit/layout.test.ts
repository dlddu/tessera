import { describe, expect, it } from 'vitest'
import { SURFACE_KINDS } from '@shared/types'
import type { LayoutNode, LayoutSnapshot, PaneNode, SplitNode, SurfaceKind } from '@shared/types'
// Import the engine + fixture from their modules directly: the layout barrel
// re-exports LayoutView, which pulls xterm (a browser-only module) and would
// crash the node test environment.
import { LayoutEngine } from '@renderer/layout/LayoutEngine'
import { buildInitialLayout } from '@renderer/layout/sampleLayout'

function collectPanes(node: LayoutNode): PaneNode[] {
  if (node.type === 'pane') return [node]
  return node.children.flatMap(collectPanes)
}

/** A single-pane (terminal) workspace, the shape `buildWorkspace` produces. */
function singlePane(): LayoutSnapshot {
  return {
    version: 1,
    workspaceId: 'ws-test',
    focusedPaneId: 'P0',
    areas: [{ id: 'area-default', kind: 'default', backend: 'host' }],
    root: {
      type: 'pane',
      id: 'P0',
      activeTabId: 'P0-t0',
      tabs: [{ id: 'P0-t0', title: 'zsh', surface: 'terminal', areaId: 'area-default' }]
    }
  }
}

describe('buildInitialLayout', () => {
  it('yields a serializable snapshot with one of each surface', () => {
    const snapshot: LayoutSnapshot = buildInitialLayout()
    expect(snapshot.version).toBeGreaterThan(0)

    const surfaces: SurfaceKind[] = collectPanes(snapshot.root).flatMap((pane) =>
      pane.tabs.map((tab) => tab.surface)
    )
    expect(new Set(surfaces)).toEqual(new Set(SURFACE_KINDS))
  })
})

describe('LayoutEngine.split', () => {
  it('splitVertical wraps the pane in a vertical split with the new pane on the right', () => {
    const engine = new LayoutEngine(singlePane())
    const newPaneId = engine.splitVertical('P0', 'editor')

    const snap = engine.serialize()
    expect(snap.root.type).toBe('split')
    const root = snap.root as SplitNode
    expect(root.direction).toBe('vertical')
    expect(root.sizes).toEqual([0.5, 0.5])
    expect(root.children).toHaveLength(2)

    const panes = collectPanes(root)
    expect(panes).toHaveLength(2)
    expect(panes[0]?.id).toBe('P0') // original pane stays on the left
    expect(panes[1]?.id).toBe(newPaneId) // new pane on the right
    expect(panes[1]?.tabs[0]?.surface).toBe('editor')
    // The new pane takes focus.
    expect(snap.focusedPaneId).toBe(newPaneId)
  })

  it('returns null for an unknown pane', () => {
    const engine = new LayoutEngine(singlePane())
    expect(engine.splitVertical('nope', 'editor')).toBeNull()
    expect(engine.serialize().root.type).toBe('pane')
  })
})

describe('LayoutEngine tabs', () => {
  it('addTab appends and activates a tab', () => {
    const engine = new LayoutEngine(singlePane())
    const tabId = engine.addTab('P0', 'browser')

    const pane = collectPanes(engine.serialize().root)[0]!
    expect(pane.tabs).toHaveLength(2)
    expect(pane.activeTabId).toBe(tabId)
    expect(pane.tabs[1]?.surface).toBe('browser')
  })

  it('closeTab on a non-last tab re-homes the active tab', () => {
    const engine = new LayoutEngine(singlePane())
    const second = engine.addTab('P0', 'browser')!
    engine.closeTab(second)

    const pane = collectPanes(engine.serialize().root)[0]!
    expect(pane.tabs).toHaveLength(1)
    expect(pane.activeTabId).toBe('P0-t0')
  })

  it('closeTab on the last tab removes the pane and collapses the split', () => {
    const engine = new LayoutEngine(singlePane())
    const rightId = engine.splitVertical('P0', 'editor')!
    const rightPane = collectPanes(engine.serialize().root).find((p) => p.id === rightId)!

    engine.closeTab(rightPane.activeTabId!)

    const snap = engine.serialize()
    expect(snap.root.type).toBe('pane')
    expect((snap.root as PaneNode).id).toBe('P0')
    // Focus (which was on the closed pane) re-homes to the survivor.
    expect(snap.focusedPaneId).toBe('P0')
  })

  it('closing the only tab of the only pane is a no-op', () => {
    const engine = new LayoutEngine(singlePane())
    engine.closeTab('P0-t0')

    const snap = engine.serialize()
    expect(snap.root.type).toBe('pane')
    expect((snap.root as PaneNode).tabs).toHaveLength(1)
  })

  it('moveTab relocates a tab across panes and focuses the target', () => {
    const engine = new LayoutEngine(singlePane())
    const rightId = engine.splitVertical('P0', 'editor')!
    const moved = engine.addTab('P0', 'browser')!

    engine.moveTab(moved, rightId)

    const panes = collectPanes(engine.serialize().root)
    const left = panes.find((p) => p.id === 'P0')!
    const right = panes.find((p) => p.id === rightId)!
    expect(left.tabs.some((t) => t.id === moved)).toBe(false)
    expect(right.tabs.some((t) => t.id === moved)).toBe(true)
    expect(right.activeTabId).toBe(moved)
    expect(engine.serialize().focusedPaneId).toBe(rightId)
  })

  it('setTabPath records the path and retitles to the basename', () => {
    const engine = new LayoutEngine(singlePane())
    const rightId = engine.splitVertical('P0', 'editor')!
    const tabId = collectPanes(engine.serialize().root).find((p) => p.id === rightId)!.tabs[0]!.id

    engine.setTabPath(tabId, '/home/me/proj-web/src/server.ts')

    const tab = collectPanes(engine.serialize().root)
      .find((p) => p.id === rightId)!
      .tabs.find((t) => t.id === tabId)!
    expect(tab.path).toBe('/home/me/proj-web/src/server.ts')
    expect(tab.title).toBe('server.ts')
  })
})

describe('LayoutEngine focus + resize', () => {
  it('resize sets the split ratios', () => {
    const engine = new LayoutEngine(singlePane())
    engine.splitVertical('P0', 'editor')
    const splitId = (engine.serialize().root as SplitNode).id

    engine.resize(splitId, [0.7, 0.3])
    expect((engine.serialize().root as SplitNode).sizes).toEqual([0.7, 0.3])
  })

  it('focusDirection moves focus left/right across a vertical split', () => {
    const engine = new LayoutEngine(singlePane())
    const rightId = engine.splitVertical('P0', 'editor')!

    engine.focusPane('P0')
    engine.focusDirection('right')
    expect(engine.serialize().focusedPaneId).toBe(rightId)

    engine.focusDirection('left')
    expect(engine.serialize().focusedPaneId).toBe('P0')

    // No pane above in a purely vertical split → focus is unchanged.
    engine.focusDirection('up')
    expect(engine.serialize().focusedPaneId).toBe('P0')
  })
})

describe('LayoutEngine serialize/restore', () => {
  it('round-trips a mutated layout', () => {
    const engine = new LayoutEngine(singlePane())
    engine.splitVertical('P0', 'editor')
    const snap = engine.serialize()

    const restored = new LayoutEngine(singlePane())
    restored.restore(snap)
    expect(restored.serialize()).toEqual(snap)
  })

  it('notifies subscribers on mutation and stops after unsubscribe', () => {
    const engine = new LayoutEngine(singlePane())
    let notified = 0
    const unsubscribe = engine.subscribe(() => {
      notified++
    })

    engine.splitVertical('P0', 'editor')
    expect(notified).toBe(1)

    unsubscribe()
    engine.addTab('P0', 'browser')
    expect(notified).toBe(1)
  })
})
