/**
 * App shell. Holds the workspace collection and decides what the window shows:
 *
 *   - no workspaces → quiet empty state + ⌘N opens the creation dialog.
 *   - workspaces    → the C-workspace-rail switcher beside a keep-alive stack of
 *     every workspace's {@link WorkspaceView} (AC1.7). All views stay mounted at
 *     once; only the active one is visible (the rest are `hidden`), so switching
 *     is instant and a workspace's live pane/tab tree survives being hidden.
 *
 * Switching is just `setActiveId`: the rail flips it on click, and ⌘/Ctrl+1–9
 * flips it by position. On boot we pull every persisted workspace (J1-S6) and
 * activate the most recently saved one, seeding each engine from its restored
 * layout skeleton. Creation still runs in the main process (`workspace.create`);
 * its result is added to the collection and activated. Component *content*
 * restore is out of scope here (J4/PRD-4) — only the window/pane/tab skeleton is
 * rebuilt, but keep-alive means a switched-away workspace keeps its live tree.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Window, WorkspaceDialog, WorkspaceRail } from '@renderer/components'
import {
  commandById,
  dispatchKey,
  workspaceContext,
  type WorkspaceCommandHandlers
} from '@renderer/commands'
import type { CreateWorkspaceResult } from '@shared/ipc'
import { WorkspaceView } from './WorkspaceView'

// The two workspace-scope shortcuts the App shell owns. ⌘N opens the creation
// dialog; ⌘1–9 switches by rail position. Dispatched through the shared registry
// (same source the layout keymap + ⌘K palette read) so they can't drift.
const NEW_WORKSPACE = commandById('new-workspace')
const SWITCH_WORKSPACE = commandById('switch-workspace')

export function App() {
  // Every known workspace skeleton (`{ workspace, layout }`), active + restored.
  const [workspaces, setWorkspaces] = useState<CreateWorkspaceResult[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Set once an update has finished downloading; surfaces the StatusBar restart
  // affordance. Holds the pending version string (for the tooltip).
  const [updateReady, setUpdateReady] = useState<string | null>(null)
  // Whether the active workspace currently has a pane zoomed (AC1.6). Lifted
  // here so the title-bar badge (drawn by the surrounding Window) can reflect
  // it; the active WorkspaceView reports its zoom state up via onZoomChange.
  const [zoomed, setZoomed] = useState(false)
  // The active workspace's host-only area, or null when none is open (AC2.7).
  // Drives the title-bar "host 영역" badge + status-bar "+ host 영역 · N pane"
  // segment; the active WorkspaceView reports it up via onHostAreaChange.
  const [hostArea, setHostArea] = useState<{ paneCount: number } | null>(null)

  // Boot restore: pull every persisted workspace and activate the most recently
  // saved one. An empty list keeps the quiet empty state.
  useEffect(() => {
    let cancelled = false
    window.tessera.persistence.list().then((snapshots) => {
      if (cancelled || snapshots.length === 0) return
      setWorkspaces(snapshots.map((s) => ({ workspace: s.workspace, layout: s.layout })))
      setActiveId(snapshots[0]!.workspace.id) // list is newest-first
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Switch to the next workspace in the rail (wraps). Backs the ⌘K palette's
  // "워크스페이스 전환" command, which WorkspaceView invokes via a prop.
  const switchNext = useCallback(() => {
    if (workspaces.length < 2) return
    const idx = workspaces.findIndex((w) => w.workspace.id === activeId)
    setActiveId(workspaces[(idx + 1) % workspaces.length]!.workspace.id)
  }, [workspaces, activeId])

  // The workspace-scope command effects (⌘N / ⌘1–9) and the palette both run
  // against these handlers. Rebuilt when the workspace list / active id change so
  // positional switching + next-switching see the current rail.
  const workspaceHandlers = useMemo<WorkspaceCommandHandlers>(
    () => ({
      create: () => setDialogOpen(true),
      // ⇧⌘W (close) lives in WorkspaceView; the App shell never closes by key.
      close: () => undefined,
      switchTo: (index) => {
        const target = workspaces[index]
        if (target) setActiveId(target.workspace.id)
      },
      switchNext
    }),
    [workspaces, switchNext]
  )

  // ⌘N — open the creation dialog. Bubble phase (as before): the empty state has
  // no surface to intercept it, and with workspaces present it still reaches here.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      dispatchKey(e, [NEW_WORKSPACE], workspaceContext(workspaceHandlers))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [workspaceHandlers])

  // ⌘/Ctrl+1–9 → switch to the workspace at that rail position (AC1.7). Capture
  // phase so a focused terminal/editor can't swallow it (it beats the active
  // WorkspaceView's keymap, which ignores digits anyway). Out-of-range numbers
  // (no such workspace) are a no-op; positions past 9 stay click-only.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      dispatchKey(e, [SWITCH_WORKSPACE], workspaceContext(workspaceHandlers))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [workspaceHandlers])

  useEffect(() => {
    return window.tessera.update.onDownloaded((e) => setUpdateReady(e.version))
  }, [])

  function handleCreated(result: CreateWorkspaceResult) {
    setWorkspaces((prev) => [result, ...prev.filter((w) => w.workspace.id !== result.workspace.id)])
    setActiveId(result.workspace.id)
    setDialogOpen(false)
  }

  // Close a workspace (AC1.7): drop it from the list — which unmounts its view,
  // tearing down its surfaces/PTYs — and permanently delete its on-disk snapshot
  // (+ backend) so it won't restore. If the closed one was visible, fall to a
  // neighbor (next, else previous); closing the last one drops to the empty state.
  function handleClose(id: string) {
    const idx = workspaces.findIndex((w) => w.workspace.id === id)
    const rest = workspaces.filter((w) => w.workspace.id !== id)
    setWorkspaces(rest)
    if (activeId === id) {
      setActiveId(rest.length === 0 ? null : rest[Math.min(idx, rest.length - 1)]!.workspace.id)
    }
    void window.tessera.workspace.close({ workspaceId: id })
  }

  function handleRestart() {
    window.tessera.update.quitAndInstall()
  }

  const active = useMemo(
    () => workspaces.find((w) => w.workspace.id === activeId) ?? null,
    [workspaces, activeId]
  )

  const dialog = dialogOpen ? (
    <WorkspaceDialog
      backendKinds={window.tessera.meta.backendKinds}
      onCreated={handleCreated}
      onCancel={() => setDialogOpen(false)}
    />
  ) : null

  if (workspaces.length > 0) {
    // Keep-alive switcher (AC1.7): the active workspace drives the window chrome,
    // but every workspace is mounted — inactive ones are `hidden` so their live
    // pane/tab tree survives until we switch back.
    const activeWs = active ?? workspaces[0]!
    const { workspace } = activeWs
    const { backend } = workspace
    // Host shows its cwd in the title bar; a container has no host cwd, so show
    // its image reference instead. The badge stays the bare kind; the status-bar
    // label reads `container · <image>` for containers (M-J2-S4 mockup), "host"
    // otherwise. Both segments are styled from `backendKind`.
    const dir = backend.kind === 'host' ? backend.cwd : backend.image
    const backendLabel =
      backend.kind === 'container' ? `container · ${backend.image}` : backend.kind
    return (
      <Window
        workspace={workspace.name}
        dir={dir}
        backendBadge={backend.kind}
        backendLabel={backendLabel}
        backendKind={backend.kind}
        updateReadyVersion={updateReady}
        onUpdateRestart={handleRestart}
        zoomed={zoomed}
        hostAreaPaneCount={hostArea?.paneCount ?? null}
        rail={
          <WorkspaceRail
            workspaces={workspaces}
            activeId={activeWs.workspace.id}
            onSelect={setActiveId}
            onNew={() => setDialogOpen(true)}
            onClose={handleClose}
          />
        }
        overlay={dialog}
      >
        {workspaces.map((w) => {
          const isActive = w.workspace.id === activeWs.workspace.id
          return (
            <div
              key={w.workspace.id}
              className="surface"
              data-testid="workspace-surface"
              data-workspace-id={w.workspace.id}
              data-active={isActive ? 'true' : undefined}
              hidden={!isActive}
            >
              <WorkspaceView
                created={w}
                active={isActive}
                onClose={handleClose}
                onNewWorkspace={workspaceHandlers.create}
                onSwitchNext={switchNext}
                onZoomChange={setZoomed}
                onHostAreaChange={setHostArea}
              />
            </div>
          )
        })}
      </Window>
    )
  }

  return (
    <Window
      workspace={null}
      backendBadge="host"
      backendLabel="host"
      backendKind="host"
      updateReadyVersion={updateReady}
      onUpdateRestart={handleRestart}
      overlay={dialog}
    >
      <div className="surface">
        <div className="empty" data-testid="empty-state">
          <span className="mark lg">
            <i />
            <i />
            <i />
            <i />
          </span>
          <div className="empty__title">아직 워크스페이스가 없습니다</div>
          <button
            type="button"
            className="empty__cta mono"
            onClick={() => setDialogOpen(true)}
            data-testid="new-workspace"
          >
            ⌘N — 새 워크스페이스
          </button>
        </div>
      </div>
    </Window>
  )
}
