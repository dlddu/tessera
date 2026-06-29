/**
 * Static layout fixture used by the skeleton shell and unit tests. This is a
 * plain data literal (no layout behavior) describing a 2×2 mosaic with one of
 * each surface kind — it is NOT the real layout engine.
 */
import type { LayoutSnapshot, PaneNode, SurfaceKind } from '@shared/types'

function pane(id: string, surface: SurfaceKind, title: string): PaneNode {
  const tabId = `${id}-t0`
  return {
    type: 'pane',
    id,
    activeTabId: tabId,
    tabs: [{ id: tabId, title, surface, areaId: 'area-default' }]
  }
}

export function buildInitialLayout(): LayoutSnapshot {
  return {
    version: 1,
    workspaceId: 'ws-sample',
    focusedPaneId: 'pane-claude',
    zoomedPaneId: null,
    areas: [{ id: 'area-default', kind: 'default', backend: 'host' }],
    root: {
      type: 'split',
      id: 'root',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        {
          type: 'split',
          id: 'col-left',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            pane('pane-term', 'terminal', 'Terminal'),
            pane('pane-edit', 'editor', 'Editor')
          ]
        },
        {
          type: 'split',
          id: 'col-right',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            pane('pane-web', 'browser', 'Browser'),
            pane('pane-claude', 'claude', 'Claude Code')
          ]
        }
      ]
    }
  }
}
