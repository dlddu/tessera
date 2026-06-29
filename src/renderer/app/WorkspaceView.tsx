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
 * switch tabs, ⌃⌘+arrows move the active tab across panes, and ⌘W closes it.
 * Tabs can also be dragged between panes (AC1.3), and clicking a pane — its tab
 * bar or its surface — focuses it. All keys are captured before the focused
 * surface so xterm/CodeMirror can't swallow them; ⌘S / ⌘O stay with the editor.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LayoutView,
  SurfaceHost,
  createPaneBodyRegistry,
  useLayout,
  useTabDrag
} from '@renderer/layout'
import type { FocusDirection } from '@renderer/layout'
import { KeymapOverlay, SurfacePicker } from '@renderer/components'
import { SURFACE_META } from '@renderer/surfaces'
import type { CreateWorkspaceResult } from '@shared/ipc'
import { buildWorkspaceSnapshot } from '@shared/types'
import type { LayoutSnapshot, SurfaceKind } from '@shared/types'

/** Debounce window for coalescing rapid layout edits into one persist. */
const SAVE_DEBOUNCE_MS = 500
/** How long the "saved ✓" toast lingers after a successful persist. */
const SAVED_TOAST_MS = 1600

interface WorkspaceViewProps {
  created: CreateWorkspaceResult
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

export function WorkspaceView({ created, onZoomChange }: WorkspaceViewProps) {
  const { workspace, layout } = created
  const { snapshot, engine, actions } = useLayout(layout)
  const [pending, setPending] = useState<PendingPick | null>(null)
  // Briefly shown after a successful layout persist ("저장됨 ✓").
  const [saved, setSaved] = useState(false)
  // Stable registry the panes register their bodies in and SurfaceHost portals
  // surfaces into — created once for this workspace.
  const paneBodies = useRef(createPaneBodyRegistry()).current
  const { drag, onTabPointerDown } = useTabDrag(actions)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const focused = engine.focusedPaneId

      // ⌃⌘⏎ — toggle window-filling zoom on the focused pane (AC1.6). Alt/Shift
      // excluded so it's an exact chord.
      if (e.ctrlKey && e.metaKey && !e.altKey && !e.shiftKey && e.key === 'Enter') {
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
      // ⌘W — close the focused pane's active tab (last tab standing is a no-op).
      if (e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        e.stopPropagation()
        actions.closeActiveTab()
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
  }, [engine, actions, pending])

  // Mirror zoom state to the shell (title-bar badge, AC1.6). Report `false` on
  // unmount so a workspace switch can't leave a stale badge behind.
  useEffect(() => {
    onZoomChange?.(snapshot.zoomedPaneId !== null)
  }, [snapshot.zoomedPaneId, onZoomChange])

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
        actions={actions}
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
