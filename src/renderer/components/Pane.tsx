/**
 * C-pane (tile): identity stripe (via `data-kind`) + a multi-tab tab bar + the
 * active tab's surface. Terminal tabs mount a live {@link TerminalSurface}
 * (M-J1-S2); editor tabs mount a live {@link EditorSurface} (M-J1-S3) and show a
 * path breadcrumb; browser/Claude tabs mount their static visual surfaces
 * ({@link BrowserSurface}/{@link ClaudeSurface}, M-J1-S4).
 *
 * The pane is presentational: clicks (focus, tab activate/close, add, split) are
 * forwarded to the {@link LayoutActions} bundle the engine provides. Tab
 * drag/reorder UI is M-J1-S5 (the engine method exists already).
 */
import type { MouseEvent, ReactNode } from 'react'
import type { PaneNode, TabNode } from '@shared/types'
import {
  BrowserSurface,
  ClaudeSurface,
  EditorSurface,
  SURFACE_META,
  SurfacePlaceholder,
  TerminalSurface
} from '@renderer/surfaces'
import { basename, dirname } from '@renderer/layout/LayoutEngine'
import type { LayoutActions } from '@renderer/layout'

interface PaneProps {
  node: PaneNode
  focused: boolean
  workspaceId: string
  workspaceName: string
  actions: LayoutActions
  /** Open the surface picker to add a tab to this pane ("+"). M-J1-S4, AC1.1. */
  onRequestAddTab: (paneId: string) => void
}

/** Editor breadcrumb: "workspace › parent-dir" (matches the M-J1-S3 mockup). */
function breadcrumb(workspaceName: string, path: string): string {
  const parent = basename(dirname(path))
  return parent ? `${workspaceName} › ${parent}` : workspaceName
}

function renderSurface(tab: TabNode, workspaceId: string, actions: LayoutActions): ReactNode {
  switch (tab.surface) {
    case 'terminal':
      return <TerminalSurface key={tab.id} workspaceId={workspaceId} areaId={tab.areaId} />
    case 'editor':
      return (
        <EditorSurface
          key={tab.id}
          tab={tab}
          workspaceId={workspaceId}
          onSetTabPath={actions.setTabPath}
        />
      )
    case 'browser':
      return <BrowserSurface key={tab.id} />
    case 'claude':
      return <ClaudeSurface key={tab.id} />
    default:
      return <SurfacePlaceholder meta={SURFACE_META[tab.surface]} />
  }
}

export function Pane({
  node,
  focused,
  workspaceId,
  workspaceName,
  actions,
  onRequestAddTab
}: PaneProps) {
  const activeTab = node.tabs.find((t) => t.id === node.activeTabId) ?? node.tabs[0]
  const activeMeta = SURFACE_META[activeTab?.surface ?? 'terminal']
  const showCrumb = activeTab?.surface === 'editor' && activeTab.path !== undefined

  function stop(e: MouseEvent) {
    e.stopPropagation()
  }

  return (
    <div
      className={focused ? 'pane focused' : 'pane'}
      data-kind={activeMeta.dataKind}
      data-testid="pane"
      onMouseDown={() => actions.focusPane(node.id)}
    >
      <div className="tabbar">
        {node.tabs.map((tab) => {
          const meta = SURFACE_META[tab.surface]
          const active = tab.id === node.activeTabId
          return (
            <div
              key={tab.id}
              className={active ? 'tab active' : 'tab'}
              data-kind={meta.dataKind}
              data-testid="pane-tab"
              onMouseDown={() => actions.activateTab(node.id, tab.id)}
            >
              <span className="dot" />
              {tab.title}
              <span
                className="x"
                data-testid="tab-close"
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
      <div className="body">
        {activeTab ? renderSurface(activeTab, workspaceId, actions) : null}
      </div>
    </div>
  )
}
