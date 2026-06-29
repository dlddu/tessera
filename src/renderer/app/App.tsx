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
import { useEffect, useMemo, useState } from 'react'
import { Window, WorkspaceDialog, WorkspaceRail } from '@renderer/components'
import type { CreateWorkspaceResult } from '@shared/ipc'
import { WorkspaceView } from './WorkspaceView'

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setDialogOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ⌘/Ctrl+1–9 → switch to the workspace at that rail position (AC1.7). Capture
  // phase so a focused terminal/editor can't swallow it (it beats the active
  // WorkspaceView's keymap, which ignores digits anyway). Out-of-range numbers
  // (no such workspace) are a no-op; positions past 9 stay click-only.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const target = workspaces[n - 1]
      if (!target) return
      e.preventDefault()
      e.stopPropagation()
      setActiveId(target.workspace.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [workspaces])

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
    return (
      <Window
        workspace={workspace.name}
        dir={workspace.backend.cwd}
        backendBadge="host"
        backendLabel="host"
        updateReadyVersion={updateReady}
        onUpdateRestart={handleRestart}
        zoomed={zoomed}
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
              data-active={isActive ? 'true' : undefined}
              hidden={!isActive}
            >
              <WorkspaceView created={w} active={isActive} onZoomChange={setZoomed} />
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
