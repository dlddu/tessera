/**
 * App shell. Holds the single-workspace state for M-J1-S1:
 *
 *   - no workspace  → quiet empty state + ⌘N opens the creation dialog.
 *   - workspace set → single-pane surface (`P-single`) with a terminal
 *     placeholder ("미구현"); live terminals are M-J1-S2.
 *
 * Creation itself runs in the main process (`workspace.create`); this component
 * only owns the resulting UI state.
 */
import { useEffect, useState } from 'react'
import { Pane, Window, WorkspaceDialog } from '@renderer/components'
import { SURFACE_META } from '@renderer/surfaces'
import type { CreateWorkspaceResult } from '@shared/ipc'
import type { Workspace } from '@shared/types'

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

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

  function handleCreated(result: CreateWorkspaceResult) {
    setWorkspace(result.workspace)
    setDialogOpen(false)
  }

  if (workspace) {
    return (
      <Window
        workspace={workspace.name}
        dir={workspace.backend.cwd}
        backendBadge="host"
        backendLabel="host"
      >
        <div className="col">
          <div className="row">
            <Pane meta={SURFACE_META.terminal} focused />
          </div>
        </div>
      </Window>
    )
  }

  return (
    <Window
      workspace={null}
      backendBadge="host"
      backendLabel="host"
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
