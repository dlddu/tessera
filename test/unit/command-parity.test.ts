import { describe, expect, it } from 'vitest'
import type { BackendKind, LayoutNode, LayoutSnapshot } from '@shared/types'
// Import the engine straight from its module: the layout barrel re-exports
// LayoutView, which pulls xterm (browser-only) and would crash node.
import { LayoutEngine } from '@renderer/layout/LayoutEngine'

/**
 * AC2.5 — "same UI/操作 either way." A container workspace is driven with the
 * exact same shortcuts as a host one. Here we prove that at the layer where it
 * matters: the layout operations the shortcuts invoke are backend-agnostic, so
 * an identical sequence applied to a host layout and to a container layout
 * yields an identical window/pane/tab structure. Parity isn't a feature to keep
 * in sync — it's structural, and this test is the guard that it stays so.
 *
 * ids are random (crypto.randomUUID), so the two runs can't be compared byte
 * for byte; we compare id-stripped structure + the focus position instead.
 */

/** A one-terminal workspace whose only difference is its backend. */
function singlePane(backend: BackendKind): LayoutSnapshot {
  return {
    version: 1,
    workspaceId: `ws-${backend}`,
    focusedPaneId: 'P0',
    zoomedPaneId: null,
    areas: [{ id: 'area-default', kind: 'default', backend }],
    root: {
      type: 'pane',
      id: 'P0',
      activeTabId: 'P0-t0',
      tabs: [{ id: 'P0-t0', title: 'zsh', surface: 'terminal', areaId: 'area-default' }]
    }
  }
}

/** Structure without ids: surfaces + active index per pane, direction per split. */
type NormNode =
  | { type: 'pane'; surfaces: string[]; active: number }
  | { type: 'split'; direction: string; children: NormNode[] }

function normalize(node: LayoutNode): NormNode {
  if (node.type === 'pane') {
    return {
      type: 'pane',
      surfaces: node.tabs.map((t) => t.surface),
      active: node.tabs.findIndex((t) => t.id === node.activeTabId)
    }
  }
  return { type: 'split', direction: node.direction, children: node.children.map(normalize) }
}

/** Index path from the root to the focused pane — the id-free "focus position". */
function focusPath(snapshot: LayoutSnapshot): number[] {
  const target = snapshot.focusedPaneId
  const path: number[] = []
  function walk(node: LayoutNode): boolean {
    if (node.type === 'pane') return node.id === target
    for (let i = 0; i < node.children.length; i++) {
      if (walk(node.children[i]!)) {
        path.unshift(i)
        return true
      }
    }
    return false
  }
  walk(snapshot.root)
  return path
}

/**
 * The same shortcut-driven sequence a user would run either side: split, add a
 * tab, split again, move focus, switch tab, move a tab across panes. Driven via
 * `focusedPaneId` (never a hard-coded id) so each engine acts on the same
 * structural positions despite its own random ids — exactly what the ⌘D / ⌘T /
 * ⌥⌘→ / ⇧⌘] / ⌃⌘→ keymap does.
 */
function runShortcutSequence(engine: LayoutEngine): void {
  const p0 = engine.getSnapshot().focusedPaneId!
  engine.splitVertical(p0, 'editor') // ⌘D → editor pane on the right, now focused
  const right = engine.getSnapshot().focusedPaneId!
  engine.addTab(right, 'browser') // ⌘T → browser tab in the right pane
  engine.splitHorizontal(right, 'claude') // ⇧⌘D → claude pane below, now focused
  engine.focusDirection('left') // ⌥⌘← → back to the left (terminal) pane
  engine.cycleTab('next') // ⇧⌘] → cycle (no-op: single tab there)
  engine.moveActiveTabToDirection('right') // ⌃⌘→ → push its tab into the right column
}

describe('host / container operation parity (AC2.5)', () => {
  it('identical shortcut sequences produce identical layouts on both backends', () => {
    const host = new LayoutEngine(singlePane('host'))
    const container = new LayoutEngine(singlePane('container'))

    runShortcutSequence(host)
    runShortcutSequence(container)

    const hostSnap = host.getSnapshot()
    const containerSnap = container.getSnapshot()

    // Sanity: the two really are different backends (else the test is vacuous).
    expect(hostSnap.areas[0]!.backend).toBe('host')
    expect(containerSnap.areas[0]!.backend).toBe('container')

    // The point: same structure + same focus position, regardless of backend.
    expect(normalize(containerSnap.root)).toEqual(normalize(hostSnap.root))
    expect(focusPath(containerSnap)).toEqual(focusPath(hostSnap))
  })

  it('zoom + focus behave identically on both backends', () => {
    const host = new LayoutEngine(singlePane('host'))
    const container = new LayoutEngine(singlePane('container'))

    for (const engine of [host, container]) {
      const p0 = engine.getSnapshot().focusedPaneId!
      engine.splitVertical(p0, 'editor') // two panes, right focused
      engine.toggleZoom() // ⇧⌘⏎ → zoom the focused pane
      engine.focusDirection('left') // zoom-follows-focus → left pane zoomed
    }

    const hostSnap = host.getSnapshot()
    const containerSnap = container.getSnapshot()

    // Both zoomed the same structural pane (the focused one), and focus matches.
    expect(hostSnap.zoomedPaneId).toBe(hostSnap.focusedPaneId)
    expect(containerSnap.zoomedPaneId).toBe(containerSnap.focusedPaneId)
    expect(focusPath(containerSnap)).toEqual(focusPath(hostSnap))
    expect(normalize(containerSnap.root)).toEqual(normalize(hostSnap.root))
  })
})
