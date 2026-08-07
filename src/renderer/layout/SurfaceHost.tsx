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
import type { BackendKind, LayoutNode, LayoutSnapshot, SurfaceKind, TabNode } from '@shared/types'
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
        <TerminalSurface
          workspaceId={workspaceId}
          tabId={tab.id}
          areaId={tab.areaId}
          backendKind={backendKind}
          onExit={() => actions.closeTab(tab.id)}
          onTitle={(title) => actions.setTabTitle(tab.id, title)}
        />
      )
    case 'editor':
      return (
        <EditorSurface
          tab={tab}
          workspaceId={workspaceId}
          backendKind={backendKind}
          onSetTabPath={actions.setTabPath}
        />
      )
    case 'browser':
      return (
        <BrowserSurface
          tab={tab}
          onTitle={(title) => actions.setTabTitle(tab.id, title)}
          onUrl={(url) => actions.setTabUrl(tab.id, url)}
        />
      )
    case 'claude':
      return <ClaudeSurface />
    default:
      return <SurfacePlaceholder meta={SURFACE_META[tab.surface]} />
  }
}

/**
 * Push DOM keyboard focus onto a surface so typing lands in the focused pane
 * (AC1.4). Terminals and editors expose a real focusable element — xterm's
 * hidden textarea, CodeMirror's contenteditable — and focusing it is exactly
 * what `term.focus()` / `view.focus()` do. Static surfaces (browser/Claude
 * placeholders) have no input, so we instead blur whatever held focus, so keys
 * can't leak into the surface the focus just left. A live surface that hasn't
 * mounted its input yet (a fresh split/tab) self-focuses on mount, so a missing
 * element here is a no-op, not a miss.
 */
function focusSurface(slot: HTMLElement, surface: SurfaceKind): void {
  if (surface === 'terminal' || surface === 'editor') {
    slot.querySelector<HTMLElement>('.xterm-helper-textarea, .cm-content')?.focus()
    return
  }
  const activeEl = document.activeElement
  if (activeEl instanceof HTMLElement) activeEl.blur()
}

interface SurfaceHostProps {
  snapshot: LayoutSnapshot
  workspaceId: string
  /** The workspace's backend kind, forwarded to terminal + editor surfaces (AC2.3, M-J2-S2/S3). */
  backendKind: BackendKind
  /**
   * Whether this workspace is the visible/active one (S8 keep-alive, AC1.7).
   * Only the active view reconciles DOM focus — a hidden workspace mustn't grab
   * the keyboard away from the visible one.
   */
  active: boolean
  actions: LayoutActions
  paneBodies: PaneBodyRegistry
}

export function SurfaceHost({
  snapshot,
  workspaceId,
  backendKind,
  active,
  actions,
  paneBodies
}: SurfaceHostProps) {
  // A tab runs on *its area's* backend, not the workspace's (AC2.4/AC2.7): in a
  // container workspace with a host area open, the host area's terminals exec on
  // the host and its editor browses the host fs. Resolve each tab's backend kind
  // from its area, falling back to the workspace kind (single-area workspaces).
  const areaBackend = new Map(snapshot.areas.map((area) => [area.id, area.backend]))
  const backendKindFor = (tab: TabNode): BackendKind => areaBackend.get(tab.areaId) ?? backendKind

  // One detached slot <div> per live tab; the stable portal container per tab.
  const slots = useRef(new Map<string, HTMLDivElement>())
  // The `focusedPane:activeTab` we last pushed DOM focus to. Focus is only
  // re-asserted when this changes (or was lost to a slot re-parent), never on
  // every commit — so it can't fight a click, a picker, or the user.
  const lastFocusKey = useRef<string | null>(null)

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

  // Re-parent each slot into its pane body, show only the active tab, then
  // reconcile DOM focus to the focused pane. Runs after every commit; the
  // parent/`hidden`/focus guards make the steady state a no-op. Slots for
  // closed tabs are removed (their portals already unmounted).
  useLayoutEffect(() => {
    // The surface DOM focus belongs on: the focused pane's active tab.
    const focusedPaneId = snapshot.focusedPaneId
    const focusTab = focusedPaneId
      ? live.find((lt) => lt.paneId === focusedPaneId && lt.active)
      : undefined

    const liveIds = new Set<string>()
    // Re-homing a focused element blurs it (Chromium), so track whether the
    // focus target's slot moved and re-assert focus below.
    let focusSlotReparented = false
    for (const { tab, paneId, active: activeTab } of live) {
      liveIds.add(tab.id)
      const slot = slots.current.get(tab.id)
      if (!slot) continue
      const body = paneBodies.get(paneId)
      if (body && slot.parentElement !== body) {
        body.appendChild(slot)
        if (focusTab && tab.id === focusTab.tab.id) focusSlotReparented = true
      }
      slot.hidden = !activeTab
    }
    for (const [id, slot] of slots.current) {
      if (!liveIds.has(id)) {
        slot.remove()
        slots.current.delete(id)
      }
    }

    // Keyboard focus follows the focused pane (AC1.4). A shortcut-driven focus
    // move (⌘⌥/⌃⌘ arrows, ⌘⇧[ ]) only changes `focusedPaneId` in the layout —
    // nothing puts DOM focus on the newly focused surface, so click-to-focus
    // works but shortcut-to-focus would leave the keyboard behind. Push it here.
    // Gated to the visible workspace and suppressed while a modal (the shared
    // `.scrim`) owns the keyboard; a no-op once the target already holds focus,
    // so it never fights a click, a self-focusing surface, or the picker.
    if (!active) return
    if (document.querySelector('.scrim')) return
    if (!focusTab) {
      lastFocusKey.current = null
      return
    }
    const key = `${focusedPaneId}:${focusTab.tab.id}`
    const slot = slots.current.get(focusTab.tab.id)
    if (!slot || slot.contains(document.activeElement)) {
      lastFocusKey.current = key
      return
    }
    const focusLost =
      focusSlotReparented &&
      (document.activeElement === null || document.activeElement === document.body)
    if (key !== lastFocusKey.current || focusLost) {
      focusSurface(slot, focusTab.tab.surface)
      lastFocusKey.current = key
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
              backendKind={backendKindFor(tab)}
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
