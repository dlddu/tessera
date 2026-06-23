/**
 * C-pane (tile): identity stripe (via `data-kind`) + a multi-tab tab bar + a
 * body that hosts the active tab's surface. The pane is presentational — clicks
 * (focus, tab activate/close, add, split) forward to the {@link LayoutActions}
 * bundle, and tab drags forward to the {@link TabDragController}.
 *
 * Surfaces no longer mount *inside* the body: a keep-alive {@link SurfaceHost}
 * mounts every live tab's surface once and portals it into this body (M-J1-S5),
 * so moving/switching tabs never remounts — and never kills a terminal's PTY.
 * The body is therefore an empty mount point registered by ref; only its tab
 * bar and the drop-zone overlay are this component's own DOM.
 */
import { useCallback, type MouseEvent } from 'react'
import type { PaneNode } from '@shared/types'
import { SURFACE_META } from '@renderer/surfaces'
import { basename, dirname } from '@renderer/layout/LayoutEngine'
import type { LayoutActions, PaneBodyRegistry, TabDragState } from '@renderer/layout'
import type { TabDragController } from '@renderer/layout'

interface PaneProps {
  node: PaneNode
  focused: boolean
  workspaceName: string
  actions: LayoutActions
  /** Registry the keep-alive SurfaceHost re-parents tab surfaces through. */
  paneBodies: PaneBodyRegistry
  /** Live tab-drag state (drives `.tab.drag` + the drop-zone overlay). */
  drag: TabDragState | null
  /** Begin dragging a tab (pointer down on the tab). */
  onTabPointerDown: TabDragController['onTabPointerDown']
  /** Open the surface picker to add a tab to this pane ("+"). M-J1-S4, AC1.1. */
  onRequestAddTab: (paneId: string) => void
}

/** Editor breadcrumb: "workspace › parent-dir" (matches the M-J1-S3 mockup). */
function breadcrumb(workspaceName: string, path: string): string {
  const parent = basename(dirname(path))
  return parent ? `${workspaceName} › ${parent}` : workspaceName
}

export function Pane({
  node,
  focused,
  workspaceName,
  actions,
  paneBodies,
  drag,
  onTabPointerDown,
  onRequestAddTab
}: PaneProps) {
  const activeTab = node.tabs.find((t) => t.id === node.activeTabId) ?? node.tabs[0]
  const activeMeta = SURFACE_META[activeTab?.surface ?? 'terminal']
  const showCrumb = activeTab?.surface === 'editor' && activeTab.path !== undefined
  const isDropTarget = drag !== null && drag.overPaneId === node.id

  // Stable per-pane ref: registers the empty body so SurfaceHost can portal the
  // tab surfaces in. `node.id` is stable for the pane's life, so this fires only
  // on mount/unmount, not on every render.
  const registerBody = useCallback(
    (el: HTMLElement | null) => paneBodies.register(node.id, el),
    [paneBodies, node.id]
  )

  function stop(e: MouseEvent) {
    e.stopPropagation()
  }

  return (
    <div
      className={focused ? 'pane focused' : 'pane'}
      data-kind={activeMeta.dataKind}
      data-pane-id={node.id}
      data-testid="pane"
      onMouseDown={() => actions.focusPane(node.id)}
    >
      <div className="tabbar">
        {node.tabs.map((tab) => {
          const meta = SURFACE_META[tab.surface]
          const active = tab.id === node.activeTabId
          const dragging = drag?.tabId === tab.id
          return (
            <div
              key={tab.id}
              className={`tab${active ? ' active' : ''}${dragging ? ' drag' : ''}`}
              data-kind={meta.dataKind}
              data-testid="pane-tab"
              onMouseDown={() => actions.activateTab(node.id, tab.id)}
              onPointerDown={(e) => onTabPointerDown(tab.id, tab.title, e)}
            >
              <span className="dot" />
              {tab.title}
              <span
                className="x"
                data-testid="tab-close"
                onPointerDown={stop}
                onMouseDown={(e) => {
                  stop(e)
                  actions.closeTab(tab.id)
                }}
              >
                ×
              </span>
            </div>
          )
        })}
        <span className="add" data-testid="tab-add" onMouseDown={() => onRequestAddTab(node.id)}>
          +
        </span>
        <div className="spacer" />
        {showCrumb ? (
          <div className="crumb">{breadcrumb(workspaceName, activeTab.path!)}</div>
        ) : null}
      </div>
      <div className="body" ref={registerBody} data-testid="pane-body" />
      {isDropTarget ? (
        <div className="drop-zone" data-testid="drop-zone">
          ⤵ 여기에 탭 놓기
        </div>
      ) : null}
    </div>
  )
}
