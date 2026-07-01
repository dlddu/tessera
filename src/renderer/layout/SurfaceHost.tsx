/**
 * Keep-alive surface host (M-J1-S5).
 *
 * The problem: surfaces used to mount inside each {@link Pane}'s body, so a tab
 * move or pane collapse remounted them — and remounting a terminal disposes its
 * surface, which *kills the PTY* (`registerSurfaceIpc` → `SurfaceRegistry`).
 * Switching/moving tabs would therefore reset live shells and editors.
 *
 * The fix: mount every live tab's surface exactly once here, at a stable React
 * position keyed by tab id, and {@link createPortal} each into its own detached
 * "slot" `<div>`. A layout effect re-parents those slot divs into the right
 * pane body (and toggles `hidden` for the inactive ones). Because the portal's
 * *container* (the slot div) never changes for a given tab, React never
 * unmounts the surface — we only move the slot's DOM node around. So PTYs and
 * editor buffers survive tab switches, cross-pane moves, and pane collapse.
 *
 * Slots are pruned only when a tab is actually closed (gone from the snapshot),
 * which is the one case where disposing the surface — and its PTY — is correct.
 */
import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { BackendKind, LayoutNode, LayoutSnapshot, TabNode } from '@shared/types'
import {
  BrowserSurface,
  ClaudeSurface,
  EditorSurface,
  SURFACE_META,
  SurfacePlaceholder,
  TerminalSurface
} from '@renderer/surfaces'
import type { LayoutActions } from './useLayout'
import type { PaneBodyRegistry } from './paneBodies'

interface LiveTab {
  tab: TabNode
  paneId: string
  active: boolean
}

/** Flatten the tree to every tab plus its owning pane and active flag. */
function collectLiveTabs(node: LayoutNode, acc: LiveTab[]): void {
  if (node.type === 'pane') {
    const activeId = node.activeTabId ?? node.tabs[0]?.id ?? null
    for (const tab of node.tabs) {
      acc.push({ tab, paneId: node.id, active: tab.id === activeId })
    }
    return
  }
  for (const child of node.children) collectLiveTabs(child, acc)
}

/** The live view for one tab — same mapping the pane used to do inline. */
function TabSurface({
  tab,
  workspaceId,
  backendKind,
  actions
}: {
  tab: TabNode
  workspaceId: string
  backendKind: BackendKind
  actions: LayoutActions
}) {
  switch (tab.surface) {
    case 'terminal':
      return (
        <TerminalSurface workspaceId={workspaceId} areaId={tab.areaId} backendKind={backendKind} />
      )
    case 'editor':
      return <EditorSurface tab={tab} workspaceId={workspaceId} onSetTabPath={actions.setTabPath} />
    case 'browser':
      return <BrowserSurface />
    case 'claude':
      return <ClaudeSurface />
    default:
      return <SurfacePlaceholder meta={SURFACE_META[tab.surface]} />
  }
}

interface SurfaceHostProps {
  snapshot: LayoutSnapshot
  workspaceId: string
  /** The workspace's backend kind, forwarded to terminal surfaces (AC2.3, M-J2-S2). */
  backendKind: BackendKind
  actions: LayoutActions
  paneBodies: PaneBodyRegistry
}

export function SurfaceHost({
  snapshot,
  workspaceId,
  backendKind,
  actions,
  paneBodies
}: SurfaceHostProps) {
  // One detached slot <div> per live tab; the stable portal container per tab.
  const slots = useRef(new Map<string, HTMLDivElement>())

  const live: LiveTab[] = []
  collectLiveTabs(snapshot.root, live)

  /** The stable portal container for `tabId`, created lazily on first sight. */
  function slotFor(tabId: string): HTMLDivElement {
    let slot = slots.current.get(tabId)
    if (!slot) {
      slot = document.createElement('div')
      slot.className = 'surface-slot'
      slot.dataset.tabId = tabId
      slots.current.set(tabId, slot)
    }
    return slot
  }

  // Re-parent each slot into its pane body and show only the active tab. Runs
  // after every commit; the parent/`hidden` guards make the steady state a
  // no-op. Slots for closed tabs are removed (their portals already unmounted).
  useLayoutEffect(() => {
    const liveIds = new Set<string>()
    for (const { tab, paneId, active } of live) {
      liveIds.add(tab.id)
      const slot = slots.current.get(tab.id)
      if (!slot) continue
      const body = paneBodies.get(paneId)
      if (body && slot.parentElement !== body) body.appendChild(slot)
      slot.hidden = !active
    }
    for (const [id, slot] of slots.current) {
      if (!liveIds.has(id)) {
        slot.remove()
        slots.current.delete(id)
      }
    }
  })

  return (
    <>
      {live.map(({ tab, paneId }) =>
        createPortal(
          // Click-to-focus: portaled surface events bubble through SurfaceHost's
          // React tree, not the pane's, so the pane's own onMouseDown never sees
          // them. Catch it here in the capture phase (before xterm/CodeMirror can
          // stop propagation) and focus the owning pane. focusPane only sets
          // state, so it doesn't fight the surface for DOM focus.
          <div className="surface-mount" onMouseDownCapture={() => actions.focusPane(paneId)}>
            <TabSurface
              tab={tab}
              workspaceId={workspaceId}
              backendKind={backendKind}
              actions={actions}
            />
          </div>,
          slotFor(tab.id),
          tab.id
        )
      )}
    </>
  )
}
