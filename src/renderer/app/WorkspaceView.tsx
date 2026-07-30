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
 * ⌘⌥/ toggles the on-demand key-hint overlay, and ⌘K opens the command palette —
 * a searchable, mouse-reachable twin of these same shortcuts (J2-S5, AC2.5).
 * Both the keymap and the palette dispatch the one shared command registry, so a
 * host and a container workspace are driven identically (parity is structural —
 * no command branches on the backend). Tabs can also be dragged between panes
 * (AC1.3), and clicking a pane — its tab bar or its surface — focuses it. All
 * keys are captured before the focused surface so xterm/CodeMirror can't swallow
 * them; ⌘S / ⌘O stay with the editor.
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
import { createPortal } from 'react-dom'
import {
  LayoutView,
  SurfaceHost,
  createPaneBodyRegistry,
  useLayout,
  useTabDrag
} from '@renderer/layout'
import type { LayoutActions } from '@renderer/layout'
import { CommandPalette, KeymapOverlay, SurfacePicker } from '@renderer/components'
import {
  COMMANDS,
  LAYOUT_COMMANDS,
  commandById,
  dispatchKey,
  type Command,
  type CommandContext,
  type PendingPick
} from '@renderer/commands'
import { SURFACE_META } from '@renderer/surfaces'
import { captureEditorStates, subscribeEditorChanges } from '@renderer/surfaces/editorStateRegistry'
import type { CreateWorkspaceResult } from '@shared/ipc'
import { buildWorkspaceSnapshot } from '@shared/types'
import type { LayoutNode, LayoutSnapshot, SurfaceKind } from '@shared/types'

// The chords the layout view dispatches: every layout shortcut plus ⇧⌘W (close
// workspace). ⌘N / ⌘1–9 stay with the App shell; ⌘K + Esc are handled inline
// below (they own modal priority, so they aren't registry commands).
const WORKSPACE_VIEW_KEYS: readonly Command[] = [...LAYOUT_COMMANDS, commandById('close-workspace')]

/** Debounce window for coalescing rapid layout edits into one persist. */
const SAVE_DEBOUNCE_MS = 500
/** How long the "saved ✓" toast lingers after a successful persist. */
const SAVED_TOAST_MS = 1600
/** How long the "routed to browser" toast lingers after a routed open (AC3.2). */
const ROUTING_TOAST_MS = 3500

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
  /**
   * Open the new-workspace dialog (⌘N). Threaded from the App shell so the ⌘K
   * palette can run the workspace-scope "새 워크스페이스" command (AC2.5 superset).
   */
  onNewWorkspace: () => void
  /**
   * Advance to the next workspace in the rail. Backs the palette's "워크스페이스
   * 전환" command; the App shell owns positional ⌘1–9 switching itself.
   */
  onSwitchNext: () => void
  /** Report zoom state up so the window title-bar badge can reflect it (AC1.6). */
  onZoomChange?: (zoomed: boolean) => void
  /**
   * Report the host-only area's live state up so the window chrome (title-bar
   * "host 영역" badge + status-bar "+ host 영역 · N pane") can reflect it, or
   * `null` when no host area is open (AC2.7/AC2.8).
   */
  onHostAreaChange?: (state: { paneCount: number } | null) => void
  /**
   * The Window's title-bar status slot this view portals its toasts into
   * (saved ✓ / routed / tab-drag), so notices appear in the header instead of
   * over the panes. Only the active view portals — a hidden keep-alive
   * workspace (e.g. its terminal exiting → autosave) must not raise a toast in
   * the shared title bar. `null` until the slot mounts.
   */
  toastHost?: HTMLElement | null
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

/** First pane id in pre-order — the fallback target for a routed browser tab. */
function firstPaneId(node: LayoutNode): string | null {
  if (node.type === 'pane') return node.id
  for (const child of node.children) {
    const id = firstPaneId(child)
    if (id) return id
  }
  return null
}

/** Number of panes belonging to `areaId` (for the "+ host 영역 · N pane" segment). */
function countAreaPanes(node: LayoutNode, areaId: string): number {
  return node.type === 'pane'
    ? node.tabs[0]?.areaId === areaId
      ? 1
      : 0
    : node.children.reduce((sum, child) => sum + countAreaPanes(child, areaId), 0)
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

export function WorkspaceView({
  created,
  active,
  onClose,
  onNewWorkspace,
  onSwitchNext,
  onZoomChange,
  onHostAreaChange,
  toastHost = null
}: WorkspaceViewProps) {
  const { workspace, layout } = created
  const { snapshot, engine, actions } = useLayout(layout)
  const [pending, setPending] = useState<PendingPick | null>(null)
  // Briefly shown after a successful layout persist ("저장됨 ✓").
  const [saved, setSaved] = useState(false)
  // The key-hint overlay is summoned on demand with `⌘⌥/` rather than always
  // sitting over the layout, so it stays out of the way until wanted (default off).
  const [showKeymap, setShowKeymap] = useState(false)
  // The ⌘K command palette (default off) — a searchable, mouse-reachable twin of
  // the keymap, drawn from the same registry so the two can't drift (AC2.5).
  const [showPalette, setShowPalette] = useState(false)
  // The URL of the most recent routed browser-open (direction A, AC3.2), shown
  // as a self-dismissing chip in the title bar. Set only while this workspace
  // is active so only the visible workspace ever raises it.
  const [routedUrl, setRoutedUrl] = useState<string | null>(null)
  // Stable registry the panes register their bodies in and SurfaceHost portals
  // surfaces into — created once for this workspace.
  const paneBodies = useRef(createPaneBodyRegistry()).current
  const { drag, onTabPointerDown } = useTabDrag(actions)

  // Closing the *last* surface closes the workspace instead of leaving it empty:
  // when only one tab remains, a tab-close (⌘W, the tab ×, or a terminal exiting
  // on its own) deletes the workspace (AC1.7). `layoutActions` swaps the two
  // close ops for this guarded pair so the keymap, the pane ×, and the
  // keep-alive SurfaceHost (terminal exit → close tab) all honour it; everything
  // else passes through unchanged. Reads live tab count from the engine so it
  // stays stable.
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

  // Host-only area (AC2.7). Open registers a host backend for a fresh area (main
  // process) and then adds the matching host subtree to the layout under the
  // same id; a host workspace, or one that already has a host area, is a no-op.
  // Close just collapses the layout — the backend is dropped by the reconcile
  // effect below, which also covers the last host pane being closed on its own.
  const openHostArea = useCallback(() => {
    if (workspace.backend.kind !== 'container') return
    if (engine.getSnapshot().areas.some((a) => a.kind === 'host')) return
    void window.tessera.workspace
      .openHostArea({ workspaceId: workspace.id })
      .then(({ area }) => engine.openHostArea(area))
      .catch(() => {
        // Opening failed (e.g. the workspace backend is gone) — leave the layout
        // untouched rather than add a host subtree with no backend behind it.
      })
  }, [engine, workspace.id, workspace.backend.kind])

  const closeHostArea = useCallback(() => {
    const host = engine.getSnapshot().areas.find((a) => a.kind === 'host')
    if (host) engine.closeHostArea(host.id)
  }, [engine])

  // The context every command runs against — shared by the keymap dispatcher and
  // the ⌘K palette so a shortcut and its palette twin do exactly the same thing.
  // Built on demand (not memoized as a value) so `focusedPaneId` is read live at
  // the moment of dispatch. `layout` is the guarded action bundle, so ⌘W / the
  // "탭 닫기" command close the workspace when the last tab goes (AC1.7).
  const makeCtx = useCallback(
    (): CommandContext => ({
      layout: layoutActions,
      setPending,
      focusedPaneId: engine.focusedPaneId,
      toggleKeymap: () => setShowKeymap((shown) => !shown),
      workspace: {
        create: onNewWorkspace,
        close: closeWorkspace,
        // Positional switching is the App shell's job (⌘1–9); the palette only
        // ever advances to the next workspace, so this stays a no-op here.
        switchTo: () => undefined,
        switchNext: onSwitchNext
      },
      hostArea: { open: openHostArea, close: closeHostArea }
    }),
    [
      layoutActions,
      engine,
      onNewWorkspace,
      closeWorkspace,
      onSwitchNext,
      openHostArea,
      closeHostArea
    ]
  )

  // Run a command chosen in the palette, then close it. If the command opens the
  // surface picker (split / add tab), `pending` takes over and the picker shows.
  const runCommand = useCallback(
    (command: Command) => {
      command.run(makeCtx())
      setShowPalette(false)
    },
    [makeCtx]
  )

  useEffect(() => {
    // Only the visible workspace owns the global (capture-phase) keymap. Hidden
    // keep-alive workspaces stay mounted but must not intercept shortcuts (S8).
    if (!active) return
    function onKey(e: KeyboardEvent) {
      // ⌘K — toggle the command palette. Held off while the surface picker is
      // open so two modals never stack. Exact chord (no ⌥/⌃/⇧) so it can't be
      // confused with other bindings.
      if (
        e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'k' || e.key === 'K') &&
        !pending
      ) {
        e.preventDefault()
        e.stopPropagation()
        setShowPalette((shown) => !shown)
        return
      }
      // While the palette is open it owns the keyboard: its input handles typing
      // and ↑/↓/Enter/Esc, so the layout chords stay inert (no double-fire).
      if (showPalette) return

      // Esc — leave zoom. Deferred to the surface picker while it's open (it has
      // its own Esc-to-cancel), and a no-op when nothing is zoomed so it never
      // swallows Esc from the focused surface. Kept inline (not a registry
      // command) because it's the picker-priority inverse of zoom.
      if (e.key === 'Escape') {
        if (!pending && engine.zoomedPaneId !== null) {
          e.preventDefault()
          e.stopPropagation()
          actions.clearZoom()
        }
        return
      }

      // Every other shortcut runs through the shared registry: the first command
      // whose chord matches is dispatched against a live context. This is the
      // single source the ⌘K palette and the hint surfaces also read, so a
      // rebinding updates all of them at once. Covers the layout shortcuts
      // (split ⌘D/⇧⌘D, ⌘T, ⌘W, focus ⌥⌘+arrows, tab-move ⌃⌘+arrows, tab-switch
      // ⇧⌘[ ], zoom ⇧⌘⏎, overlay ⌘⌥/) plus ⇧⌘W (close workspace).
      dispatchKey(e, WORKSPACE_VIEW_KEYS, makeCtx())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [engine, actions, pending, active, showPalette, makeCtx])

  // Mirror zoom state to the shell (title-bar badge, AC1.6) — but only while
  // active, so a hidden keep-alive workspace can't drive the badge (S8). The
  // active view re-reports on every switch, so the badge always tracks it.
  // Report `false` on unmount so a teardown can't leave a stale badge behind.
  useEffect(() => {
    if (active) onZoomChange?.(snapshot.zoomedPaneId !== null)
  }, [active, snapshot.zoomedPaneId, onZoomChange])

  useEffect(() => () => onZoomChange?.(false), [onZoomChange])

  // Reconcile host-area backends with the layout (AC2.7). The engine owns the
  // layout; the host backend lives in the main process. When a host area leaves
  // the snapshot — an explicit close (⇧⌃⌘H / band ×) or its last pane closing on
  // its own — drop its host backend so nothing can spawn against the gone area
  // (AC2.4/AC2.8). Additions need no call here: the open path registered the
  // backend before adding the area. `snapshot.areas` keeps a stable reference
  // across non-area mutations, so this only runs when the area set changes.
  const knownHostAreas = useRef<Set<string>>(new Set())
  useEffect(() => {
    const current = new Set(snapshot.areas.filter((a) => a.kind === 'host').map((a) => a.id))
    for (const areaId of knownHostAreas.current) {
      if (!current.has(areaId)) {
        void window.tessera.workspace.closeHostArea({ workspaceId: workspace.id, areaId })
      }
    }
    knownHostAreas.current = current
  }, [snapshot.areas, workspace.id])

  // Report the host area's live state (present? how many panes?) up to the shell
  // so the title-bar "host 영역" badge + status-bar "+ host 영역 · N pane" track
  // it — gated to the active view (like zoom) so a hidden workspace can't drive
  // the chrome (S8). Report `null` on unmount so a teardown leaves no stale badge.
  const hostAreaState = useMemo(() => {
    const host = snapshot.areas.find((a) => a.kind === 'host')
    return host ? { paneCount: countAreaPanes(snapshot.root, host.id) } : null
  }, [snapshot])

  useEffect(() => {
    if (active) onHostAreaChange?.(hostAreaState)
  }, [active, hostAreaState, onHostAreaChange])

  useEffect(() => () => onHostAreaChange?.(null), [onHostAreaChange])

  // Direction A (AC3.2): a container-originated URL routed to the host opens a
  // new browser tab in this workspace's focused pane, with a self-dismissing
  // toast (M-J3-S1). The event carries its workspace, so each keep-alive
  // view acts only on its own (AC3.5). Read via a ref so activation changes
  // don't re-subscribe (and risk missing an event in the gap). The tab is added
  // regardless of visibility — its tool's URL must open where the tool runs —
  // but the toast is only raised while active, so a routed open in a background
  // workspace never flashes a notice over the visible one.
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    return window.tessera.routing.onOpenUrl((event) => {
      if (event.workspaceId !== workspace.id) return
      const snapshot = engine.getSnapshot()
      const paneId = engine.focusedPaneId ?? firstPaneId(snapshot.root)
      if (paneId) actions.addTab(paneId, 'browser', event.url)
      if (activeRef.current) setRoutedUrl(event.url)
    })
  }, [workspace.id, engine, actions])

  // Auto-dismiss the routing toast a few seconds after it appears (re-armed if
  // another URL routes in the meantime).
  useEffect(() => {
    if (!routedUrl) return
    const timer = setTimeout(() => setRoutedUrl(null), ROUTING_TOAST_MS)
    return () => clearTimeout(timer)
  }, [routedUrl])

  // Drop the toast when this workspace is switched away from, so a routed open in
  // a background workspace never leaves a stale toast for the visible one.
  useEffect(() => {
    if (!active) setRoutedUrl(null)
  }, [active])

  // Autosave (AC1.5 layout skeleton + AC4.1 editor content): persist a debounced
  // snapshot whenever the layout changes *or* an editor's buffer changes, flush
  // synchronously on app quit so the last edit can't be lost in the debounce
  // window, and flush once on unmount (e.g. a future workspace switch). Editor
  // content rides `surfaces`, captured live from every editor at persist time.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null
    let toastTimer: ReturnType<typeof setTimeout> | null = null

    const snapshotNow = () =>
      buildWorkspaceSnapshot(
        workspace,
        engine.serialize(),
        Date.now(),
        captureEditorStates(workspace.id)
      )

    const save = (withToast: boolean) => {
      void window.tessera.persistence.save(snapshotNow()).then(() => {
        if (!withToast) return
        setSaved(true)
        if (toastTimer) clearTimeout(toastTimer)
        toastTimer = setTimeout(() => setSaved(false), SAVED_TOAST_MS)
      })
    }

    const scheduleSave = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => save(true), SAVE_DEBOUNCE_MS)
    }

    // Layout mutations (split / add / close / move / zoom) and editor buffer
    // edits both debounce into a single persist.
    const unsubscribeLayout = engine.subscribe(scheduleSave)
    const unsubscribeEditors = subscribeEditorChanges(workspace.id, scheduleSave)

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
      unsubscribeLayout()
      unsubscribeEditors()
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
        onCloseHostArea={closeHostArea}
      />
      <SurfaceHost
        snapshot={snapshot}
        workspaceId={workspace.id}
        backendKind={workspace.backend.kind}
        active={active}
        actions={layoutActions}
        paneBodies={paneBodies}
      />
      {showKeymap ? <KeymapOverlay /> : null}
      {showPalette ? (
        <CommandPalette
          commands={COMMANDS}
          onRun={runCommand}
          onCancel={() => setShowPalette(false)}
        />
      ) : null}
      {pending ? (
        <SurfacePicker title={PICKER_TITLE[pending.action]} onPick={pick} onCancel={cancelPick} />
      ) : null}
      {/* Toasts surface as chips in the window title bar (portal into the
          Window's `.titlebar-status` slot, left of the badges). Gated on
          `active` so a hidden keep-alive workspace never raises a notice in
          the shared header. The long copy moves to a hover tooltip; the drag
          chip keeps its live "tab → target pane" detail inline. */}
      {active && toastHost
        ? createPortal(
            <>
              {routedUrl ? (
                <div
                  className="toast route"
                  data-testid="routing-toast"
                  title="컨테이너의 브라우저 요청을 호스트 탭으로 열었습니다"
                >
                  <span className="ti">◆</span>
                  <span className="tt">브라우저로 라우팅됨</span>
                </div>
              ) : null}
              {saved ? (
                <div
                  className="toast ok"
                  data-testid="layout-saved-toast"
                  title="창·패널·탭 골격이 저장되었습니다"
                >
                  <span className="ti">✓</span>
                  <span className="tt">레이아웃 저장됨</span>
                </div>
              ) : null}
              {drag ? (
                <div className="toast" data-testid="tab-drag-toast">
                  <span className="ti">⤷</span>
                  <span className="tt">탭 이동 중</span>
                  <span className="td">
                    <span className="mono">{drag.title}</span> →{' '}
                    {paneLabel(snapshot, drag.overPaneId)}
                  </span>
                </div>
              ) : null}
            </>,
            toastHost
          )
        : null}
    </>
  )
}
