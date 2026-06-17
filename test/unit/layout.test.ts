import { describe, expect, it } from 'vitest'
import { NotImplementedError } from '@shared/errors'
import { SURFACE_KINDS } from '@shared/types'
import type { LayoutNode, LayoutSnapshot, PaneNode, SurfaceKind } from '@shared/types'
import { buildInitialLayout, LayoutEngine } from '@renderer/layout'

function collectPanes(node: LayoutNode): PaneNode[] {
  if (node.type === 'pane') return [node]
  return node.children.flatMap(collectPanes)
}

describe('layout skeleton', () => {
  it('buildInitialLayout yields a serializable snapshot with one of each surface', () => {
    const snapshot: LayoutSnapshot = buildInitialLayout()
    expect(snapshot.version).toBeGreaterThan(0)

    const surfaces: SurfaceKind[] = collectPanes(snapshot.root).flatMap((pane) =>
      pane.tabs.map((tab) => tab.surface)
    )
    expect(new Set(surfaces)).toEqual(new Set(SURFACE_KINDS))
  })

  it('LayoutEngine.serialize/restore are not-implemented stubs', () => {
    const engine = new LayoutEngine()
    expect(() => engine.serialize()).toThrow(NotImplementedError)
    expect(() => engine.restore(buildInitialLayout())).toThrow(NotImplementedError)
  })
})
