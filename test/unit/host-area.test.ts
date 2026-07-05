import { describe, expect, it } from 'vitest'
import { DEFAULT_AREA_ID, stripHostAreas } from '@shared/types'
import type {
  Area,
  BackendKind,
  LayoutNode,
  LayoutSnapshot,
  PaneNode,
  SplitNode
} from '@shared/types'
// Import the engine straight from its module: the layout barrel re-exports
// LayoutView, which pulls xterm (browser-only) and would crash the node env.
import { LayoutEngine } from '@renderer/layout/LayoutEngine'

/**
 * M-J2-S7 (AC2.7/AC2.8) — a container workspace's optional host-only area. These
 * ungated (no container runtime) unit tests cover the renderer/shared seams of
 * the vertical slice: the layout engine opens/closes the host area and enforces
 * the area boundary, and persistence strips a host area on restore. The backend
 * registry's area add/remove lives in host-area-registry.test.ts (a main-process
 * test), matching how the suite keeps renderer and main tests in separate files.
 */

const HOST_AREA: Area = { id: 'area-host', kind: 'host', backend: 'host' }

function collectPanes(node: LayoutNode): PaneNode[] {
  if (node.type === 'pane') return [node]
  return node.children.flatMap(collectPanes)
}

/** A one-terminal workspace whose only difference is its backend. */
function singlePane(backend: BackendKind): LayoutSnapshot {
  return {
    version: 1,
    workspaceId: `ws-${backend}`,
    focusedPaneId: 'P0',
    zoomedPaneId: null,
    areas: [{ id: DEFAULT_AREA_ID, kind: 'default', backend }],
    root: {
      type: 'pane',
      id: 'P0',
      activeTabId: 'P0-t0',
      tabs: [{ id: 'P0-t0', title: 'zsh', surface: 'terminal', areaId: DEFAULT_AREA_ID }]
    }
  }
}

/** Open a host area on a fresh container workspace; return the engine + host pane. */
function withHostArea(): { engine: LayoutEngine; hostPane: PaneNode } {
  const engine = new LayoutEngine(singlePane('container'))
  engine.openHostArea(HOST_AREA)
  const hostPane = collectPanes(engine.serialize().root).find(
    (p) => p.tabs[0]?.areaId === HOST_AREA.id
  )!
  return { engine, hostPane }
}

describe('LayoutEngine host area (AC2.7/AC2.8)', () => {
  it('openHostArea wraps the root in a top-level area split beside a host pane', () => {
    const { engine, hostPane } = withHostArea()
    const snap = engine.serialize()

    // Root is now the area boundary: a top-level split with one child per area.
    expect(snap.root.type).toBe('split')
    const root = snap.root as SplitNode
    expect(root.direction).toBe('vertical') // container left, host right (mockup)
    expect(root.children).toHaveLength(2)

    // The areas list gained the host area; the host pane holds one host terminal.
    expect(snap.areas.map((a) => a.kind)).toEqual(['default', 'host'])
    expect(hostPane.tabs).toHaveLength(1)
    expect(hostPane.tabs[0]?.surface).toBe('terminal')
    expect(hostPane.tabs[0]?.areaId).toBe(HOST_AREA.id)

    // The container pane survives untouched in the default area; focus is on the
    // new host pane.
    const container = collectPanes(root).find((p) => p.id === 'P0')!
    expect(container.tabs[0]?.areaId).toBe(DEFAULT_AREA_ID)
    expect(snap.focusedPaneId).toBe(hostPane.id)
  })

  it('openHostArea is a no-op when a host area is already open (one at most)', () => {
    const { engine } = withHostArea()
    engine.openHostArea({ id: 'area-host-2', kind: 'host', backend: 'host' })
    expect(engine.serialize().areas.filter((a) => a.kind === 'host')).toHaveLength(1)
  })

  it('a tab cannot move across the area boundary (AC2.4), either direction', () => {
    const { engine, hostPane } = withHostArea()
    // A second tab in the container pane, and the host pane's own terminal.
    const containerTab = engine.addTab('P0', 'browser')!
    const hostTab = hostPane.activeTabId!

    // container → host: blocked (stays in P0).
    engine.moveTab(containerTab, hostPane.id)
    let panes = collectPanes(engine.serialize().root)
    expect(panes.find((p) => p.id === 'P0')!.tabs.some((t) => t.id === containerTab)).toBe(true)
    expect(panes.find((p) => p.id === hostPane.id)!.tabs.some((t) => t.id === containerTab)).toBe(
      false
    )

    // host → container: also blocked (host tab stays in the host pane).
    engine.moveTab(hostTab, 'P0')
    panes = collectPanes(engine.serialize().root)
    expect(panes.find((p) => p.id === hostPane.id)!.tabs.some((t) => t.id === hostTab)).toBe(true)
    expect(panes.find((p) => p.id === 'P0')!.tabs.some((t) => t.id === hostTab)).toBe(false)
  })

  it('a tab still moves freely within an area (the boundary blocks crossings only)', () => {
    const { engine } = withHostArea()
    const right = engine.splitVertical('P0', 'editor')! // both panes in the default area
    const moved = engine.addTab('P0', 'browser')!

    engine.moveTab(moved, right) // same-area move → allowed
    const panes = collectPanes(engine.serialize().root)
    expect(panes.find((p) => p.id === right)!.tabs.some((t) => t.id === moved)).toBe(true)
  })

  it('closeHostArea removes the host subtree and collapses back to the container', () => {
    const { engine } = withHostArea()
    engine.closeHostArea(HOST_AREA.id)

    const snap = engine.serialize()
    expect(snap.areas.map((a) => a.kind)).toEqual(['default'])
    // Only the original container pane remains — the top split collapsed away.
    expect(snap.root.type).toBe('pane')
    expect((snap.root as PaneNode).id).toBe('P0')
    expect(snap.focusedPaneId).toBe('P0')
  })

  it('closeHostArea is a no-op for an unknown / non-host area id', () => {
    const { engine } = withHostArea()
    const before = engine.serialize()
    engine.closeHostArea(DEFAULT_AREA_ID) // the default area is not closable this way
    engine.closeHostArea('area-nope')
    expect(engine.serialize()).toBe(before) // no commit → same snapshot reference
  })

  it('closing the host area last pane removes the area itself (AC2.7)', () => {
    const { engine, hostPane } = withHostArea()
    // Close the host pane's only tab: the area drains, so it — and the top
    // split — collapse away, leaving the container area alone.
    engine.closeTab(hostPane.activeTabId!)

    const snap = engine.serialize()
    expect(snap.areas.map((a) => a.kind)).toEqual(['default'])
    expect(snap.root.type).toBe('pane')
    expect((snap.root as PaneNode).id).toBe('P0')
  })

  it('a multi-pane host area survives losing one pane, then prunes on the last', () => {
    const { engine, hostPane } = withHostArea()
    const secondHost = engine.splitVertical(hostPane.id, 'editor')! // two host panes now

    // First host pane closes: the host area still has the second pane.
    engine.closeTab(hostPane.activeTabId!)
    expect(engine.serialize().areas.some((a) => a.kind === 'host')).toBe(true)

    // The last host pane closes: now the area is pruned.
    const remaining = collectPanes(engine.serialize().root).find((p) => p.id === secondHost)!
    engine.closeTab(remaining.activeTabId!)
    expect(engine.serialize().areas.some((a) => a.kind === 'host')).toBe(false)
    expect(engine.serialize().root.type).toBe('pane')
  })

  it('directional focus still crosses the boundary (only moves are blocked)', () => {
    const { engine, hostPane } = withHostArea()
    // Container area is the left child, host area the right → ⌥⌘→ crosses over.
    engine.focusPane('P0')
    engine.focusDirection('right')
    expect(engine.serialize().focusedPaneId).toBe(hostPane.id)
    engine.focusDirection('left')
    expect(engine.serialize().focusedPaneId).toBe('P0')
  })
})

describe('stripHostAreas (restore graceful, AC2.7)', () => {
  it('drops the host area and collapses the root to the container subtree', () => {
    const { engine } = withHostArea() // focus is on the host pane
    const stripped = stripHostAreas(engine.serialize())

    expect(stripped.areas.map((a) => a.kind)).toEqual(['default'])
    expect(stripped.areas.some((a) => a.kind === 'host')).toBe(false)
    expect(stripped.root.type).toBe('pane')
    expect((stripped.root as PaneNode).id).toBe('P0')
    // Focus (which was on the now-gone host pane) re-homes to a surviving pane.
    expect(stripped.focusedPaneId).toBe('P0')
    expect(stripped.zoomedPaneId).toBeNull()
  })

  it('keeps container panes when the container area was itself split', () => {
    const engine = new LayoutEngine(singlePane('container'))
    const rightId = engine.splitVertical('P0', 'editor')! // two container panes
    engine.openHostArea(HOST_AREA)

    const stripped = stripHostAreas(engine.serialize())
    const panes = collectPanes(stripped.root)
    expect(panes.map((p) => p.id).sort()).toEqual(['P0', rightId].sort())
    expect(stripped.areas.map((a) => a.kind)).toEqual(['default'])
  })

  it('returns the same snapshot untouched when there is no host area', () => {
    const plain = singlePane('host')
    expect(stripHostAreas(plain)).toBe(plain) // early-return, same reference
  })
})
