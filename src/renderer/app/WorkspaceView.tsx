/**
 * The live surface of one workspace: owns its {@link LayoutEngine} (via
 * `useLayout`) and renders the pane/tab tree plus the keep-alive
 * {@link SurfaceHost} that actually mounts the surfaces (M-J1-S5). Mounted only
 * once a workspace exists and keyed by its id, so each workspace gets a fresh
 * engine.
 *
 * Holds the surface-creation keymap and the S5 interaction keymap. Creation
 * paths run through the shared {@link SurfacePicker} (M-J1-S4, AC1.1): ⌘D / ⌘⇧D
 * split the focused pane, ⌘T adds a tab, the pane "+" adds a tab. The S5 keys
 * drive the layout without a mouse (AC1.4): ⌘⌥+arrows move focus, ⌘⇧[ / ⌘⇧]
 * switch tabs, ⌃⌘+arrows move the active tab across panes, and ⌘W closes it —
 * closing the last tab closes the whole workspace, and ⇧⌘W closes it outright.
 * Tabs can also be dragged between panes (AC1.3), and clicking a pane — its tab
 * bar or its surface — focuses it. All keys are captured before the focused
 * surface so xterm/CodeMirror can't swallow them; ⌘S / ⌘O stay with the editor.
 *
 * Under the S8 keep-alive switcher (AC1.7) every workspace stays mounted at once
 * — only the active one is visible. So the two *global* effects here, the
 * capture-phase keymap and the zoom→shell report, are gated on `active`: an
 * inactive (hidden) workspace must not intercept shortcuts or clobber the
 * title-bar zoom badge. Per-workspace autosave stays ungated — each view saves
 * under its own id, so keeping them all live is correct (every workspace's last
 * edit is flushed on quit).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutView,
  SurfaceHost,
  createPaneBodyRegistry,
  useLayout,
  useTabDrag
} from '@renderer/layout'
import type { FocusDirection, LayoutActions } from '@renderer/layout'
import { KeymapOverlay, SurfacePicker } from '@renderer/components'
import { SURFACE_META } from '@renderer/surfaces'
import type { CreateWorkspaceResult } from '@shared/ipc'
import { buildWorkspaceSnapshot } from '@shared/types'
import type { LayoutNode, LayoutSnapshot, SurfaceKind } from '@shared/types'

/** Debounce window for coalescing rapid layout edits into one persist. */
const SAVE_DEBOUNCE_MS = 500
/** How long the "saved ✓" toast lingers after a successful persist. */
const SAVED_TOAST_MS = 1600

interface WorkspaceViewProps {
  created: CreateWorkspaceResult
  /**
   * Whether this workspace is the visible/active one (S8 keep-alive, AC1.7).
   * Gates the global keymap and zoom report so hidden workspaces stay inert.
   */
  active: boolean
  /**
   * Close this workspace (permanently). Invoked by ⇧⌘W, and when closing the
   * last remaining tab — which would otherwise leave an empty workspace — turns
   * into closing the workspace itself (AC1.7).
   */
  onClose: (id: string) => void
  /** Report zoom state up so the window title-bar badge can reflect it (AC1.6). */
  onZoomChange?: (zoomed: boolean) => void
}

/** A pending surface choice: which pane it targets and what the pick will do. */
interface PendingPick {
  action: 'add' | 'split-v' | 'split-h'
  paneId: string
}

const PICKER_TITLE: Record<PendingPick['action'], string> = {
  add: '새 탭',
  'split-v': '세로 분할',
  'split-h': '가로 분할'
}

/** Total number of tabs across the whole layout tree. */
function countTabs(node: LayoutNode): number {
  return node.type === 'pane'
    ? node.tabs.length
    : node.children.reduce((sum, child) => sum + countTabs(child), 0)
}

/** Map an arrow key to a focus direction (S5 keyboard), or `null`. */
function arrowDirection(key: string): FocusDirection | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    default:
      return null
  }
}

/** Short label for a pane (its active tab's identity), for the drag toast. */
function paneLabel(snapshot: LayoutSnapshot, paneId: string | null): string {
  if (!paneId) return '…'
  const stack = [snapshot.root]
  while (stack.length) {
    const node = stack.pop()!
    if (node.type === 'pane') {
      if (node.id === paneId) {
        const active = node.tabs.find((t) => t.id === node.activeTabId) ?? node.tabs[0]
        return active ? `${SURFACE_META[active.surface].dataKind} pane` : 'pane'
      }
    } else {
      stack.push(...node.children)
    }
  }
  return 'pane'
}

export function WorkspaceView({ created, active, onClose, onZoomChange }: WorkspaceViewProps) {
  const { workspace, layout } = created
  const { snapshot, engine, actions } = useLayout(layout)
  const [pending, setPending] = useState<PendingPick | null>(null)
  // Briefly shown after a successful layout persist ("저장됨 ✓").
  const [saved, setSaved] = useState(false)
  // Stable registry the panes register their bodies in and SurfaceHost portals
  // surfaces into — created once for this workspace.
  const paneBodies = useRef(createPaneBodyRegistry()).current
  const { drag, onTabPointerDown } = useTabDrag(actions)

  // Closing the *last* surface closes the workspace instead of leaving it empty:
  // when only one tab remains, a tab-close (⌘W or the tab ×) deletes the
  // workspace (AC1.7). `layoutActions` swaps the two close ops for this guarded
  // pair so both the keymap and the pane × honour it; everything else passes
  // through unchanged. Reads live tab count from the engine so it stays stable.
  const closeWorkspace = useCallback(() => onClose(workspace.id), [onClose, workspace.id])
  const closeActiveOrWorkspace = useCallback(() => {
    if (countTabs(engine.getSnapshot().root) <= 1) closeWorkspace()
    else actions.closeActiveTab()
  }, [engine, actions, closeWorkspace])
  const closeTabOrWorkspace = useCallback(
    (tabId: string) => {
      if (countTabs(engine.getSnapshot().root) <= 1) closeWorkspace()
      else actions.closeTab(tabId)
    },
    [engine, actions, closeWorkspace]
  )
  const layoutActions = useMemo<LayoutActions>(
    () => ({ ...actions, closeTab: closeTabOrWorkspace, closeActiveTab: closeActiveOrWorkspace }),
    [actions, closeTabOrWorkspace, closeActiveOrWorkspace]
  )

  useEffect(() => {
    // Only the visible workspace owns the global (capture-phase) keymap. Hidden
    // keep-alive workspaces stay mounted but must not intercept shortcuts (S8).
    if (!active) return
    function onKey(e: KeyboardEvent) {
      const focused = engine.focusedPaneId

      // ⇧⌘⏎ — toggle window-filling zoom on the focused pane (AC1.6). Ctrl/Alt
      // excluded so it's an exact chord.
      if (e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        actions.toggleZoom()
        return
      }
      // Esc — leave zoom. Deferred to the surface picker while it's open (it has
      // its own Esc-to-cancel), and a no-op when nothing is zoomed so it never
      // swallows Esc from the focused surface.
      if (e.key === 'Escape') {
        if (!pending && engine.zoomedPaneId !== null) {
          e.preventDefault()
          e.stopPropagation()
          actions.clearZoom()
        }
        return
      }

      // ⌘D / ⌘⇧D — split the focused pane (vertical / horizontal) via the picker.
      // Ctrl is excluded so Ctrl+D still reaches the terminal as EOF.
      if (e.metaKey && !e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        e.stopPropagation()
        if (focused) setPending({ action: e.shiftKey ? 'split-h' : 'split-v', paneId: focused })
        return
      }
      // ⌘T — add a tab to the focused pane (via the picker).
      if (e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        e.stopPropagation()
        if (focused) setPending({ action: 'add', paneId: focused })
        return
      }
      // ⌘W — close the focused pane's active tab. Closing the *last* remaining
      // tab closes the workspace instead of leaving it empty (AC1.7).
      if (e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        e.stopPropagation()
        closeActiveOrWorkspace()
        return
      }
      // ⇧⌘W — close (permanently delete) the whole workspace.
      if (e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        e.stopPropagation()
        closeWorkspace()
        return
      }
      // ⌘⇧[ / ⌘⇧] — switch the active tab within the focused pane. Match the
      // shifted glyphs ({ }) the bracket keys actually produce, plus the bare
      // brackets for layouts that report them.
      if (e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && '[]{}'.includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        actions.cycleTab(e.key === ']' || e.key === '}' ? 'next' : 'prev')
        return
      }
      // Arrow keys: ⌘⌥ moves focus; ⌃⌘ moves the active tab across panes.
      const dir = arrowDirection(e.key)
      if (dir && e.metaKey && !e.shiftKey) {
        if (e.altKey && !e.ctrlKey) {
          e.preventDefault()
          e.stopPropagation()
          actions.focusDirection(dir)
        } else if (e.ctrlKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          actions.moveActiveTabToDirection(dir)
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [engine, actions, pending, active, closeActiveOrWorkspace, closeWorkspace])

  // Mirror zoom state to the shell (title-bar badge, AC1.6) — but only while
  // active, so a hidden keep-alive workspace can't drive the badge (S8). The
  // active view re-reports on every switch, so the badge always tracks it.
  // Report `false` on unmount so a teardown can't leave a stale badge behind.
  useEffect(() => {
    if (active) onZoomChange?.(snapshot.zoomedPaneId !== null)
  }, [active, snapshot.zoomedPaneId, onZoomChange])

  useEffect(() => () => onZoomChange?.(false), [onZoomChange])

  // Autosave the layout skeleton (AC1.5): persist a debounced snapshot on every
  // layout change, flush synchronously on app quit so the last edit can't be
  // lost in the debounce window, and flush once on unmount (e.g. a future
  // workspace switch). Content is out of scope here — `buildWorkspaceSnapshot`
  // carries an empty surfaces list.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null
    let toastTimer: ReturnType<typeof setTimeout> | null = null

    const snapshotNow = () => buildWorkspaceSnapshot(workspace, engine.serialize(), Date.now())

    const save = (withToast: boolean) => {
      void window.tessera.persistence.save(snapshotNow()).then(() => {
        if (!withToast) return
        setSaved(true)
        if (toastTimer) clearTimeout(toastTimer)
        toastTimer = setTimeout(() => setSaved(false), SAVED_TOAST_MS)
      })
    }

    const unsubscribe = engine.subscribe(() => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => save(true), SAVE_DEBOUNCE_MS)
    })

    // App quit / window close: persist synchronously (a promise can't be awaited
    // in `beforeunload`) so an edit made moments before quitting still restores.
    const onBeforeUnload = () => {
      if (debounce) {
        clearTimeout(debounce)
        debounce = null
      }
      window.tessera.persistence.saveSync(snapshotNow())
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (toastTimer) clearTimeout(toastTimer)
      if (debounce) {
        // A change is still pending — flush it (without a toast on the way out).
        clearTimeout(debounce)
        save(false)
      }
    }
  }, [engine, workspace])

  const requestAddTab = useCallback((paneId: string) => {
    setPending({ action: 'add', paneId })
  }, [])

  const cancelPick = useCallback(() => {
    setPending(null)
  }, [])

  const pick = useCallback(
    (kind: SurfaceKind) => {
      if (!pending) return
      if (pending.action === 'add') {
        actions.addTab(pending.paneId, kind)
      } else if (pending.action === 'split-v') {
        actions.splitVertical(pending.paneId, kind)
      } else {
        actions.splitHorizontal(pending.paneId, kind)
      }
      setPending(null)
    },
    [pending, actions]
  )

  return (
    <>
      <LayoutView
        snapshot={snapshot}
        workspaceName={workspace.name}
        actions={layoutActions}
        paneBodies={paneBodies}
        drag={drag}
        onTabPointerDown={onTabPointerDown}
        onRequestAddTab={requestAddTab}
      />
      <SurfaceHost
        snapshot={snapshot}
        workspaceId={workspace.id}
        actions={actions}
        paneBodies={paneBodies}
      />
      <KeymapOverlay />
      {saved ? (
        <div className="toast ok" data-testid="layout-saved-toast">
          <span className="ti">✓</span>
          <div>
            <div className="tt">레이아웃 저장됨</div>
            <div className="td">창·패널·탭 골격이 저장되었습니다</div>
          </div>
        </div>
      ) : null}
      {drag ? (
        <div className="toast" data-testid="tab-drag-toast">
          <span className="ti">⤷</span>
          <div>
            <div className="tt">탭 이동 중</div>
            <div className="td">
              <span className="mono">{drag.title}</span> → {paneLabel(snapshot, drag.overPaneId)}
            </div>
          </div>
        </div>
      ) : null}
      {pending ? (
        <SurfacePicker title={PICKER_TITLE[pending.action]} onPick={pick} onCancel={cancelPick} />
      ) : null}
    </>
  )
}
