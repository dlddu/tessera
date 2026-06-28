/**
 * App shell. Holds the workspace collection and decides what the window shows:
 *
 *   - no workspaces → quiet empty state + ⌘N opens the creation dialog.
 *   - workspaces    → the active one's single live {@link WorkspaceView}; the
 *     rest are kept as restored skeletons (data only) until the switcher (S8).
 *
 * On boot we pull every persisted workspace (J1-S6) and activate the most
 * recently saved one, seeding its engine from the restored layout skeleton.
 * Creation still runs in the main process (`workspace.create`); its result is
 * added to the collection and activated. Component *content* restore is out of
 * scope here (J4/PRD-4) — only the window/pane/tab skeleton is rebuilt.
 */
import { useEffect, useMemo, useState } from 'react'
import { Window, WorkspaceDialog } from '@renderer/components'
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

  useEffect(() => {
    return window.tessera.update.onDownloaded((e) => setUpdateReady(e.version))
  }, [])

  function handleCreated(result: CreateWorkspaceResult) {
    setWorkspaces((prev) => [result, ...prev.filter((w) => w.workspace.id !== result.workspace.id)])
    setActiveId(result.workspace.id)
    setDialogOpen(false)
  }

  function handleRestart() {
    window.tessera.update.quitAndInstall()
  }

  const active = useMemo(
    () => workspaces.find((w) => w.workspace.id === activeId) ?? null,
    [workspaces, activeId]
  )

  if (active) {
    const { workspace } = active
    return (
      <Window
        workspace={workspace.name}
        dir={workspace.backend.cwd}
        backendBadge="host"
        backendLabel="host"
        updateReadyVersion={updateReady}
        onUpdateRestart={handleRestart}
      >
        <WorkspaceView key={workspace.id} created={active} />
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
      overlay={
        dialogOpen ? (
          <WorkspaceDialog
            backendKinds={window.tessera.meta.backendKinds}
            onCreated={handleCreated}
            onCancel={() => setDialogOpen(false)}
          />
        ) : null
      }
    >
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
    </Window>
  )
}
