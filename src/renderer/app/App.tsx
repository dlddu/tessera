/**
 * App shell. Holds the single-workspace state for M-J1-S1 / M-J1-S2:
 *
 *   - no workspace  → quiet empty state + ⌘N opens the creation dialog.
 *   - workspace set → single-pane surface (`P-single`) running a live host
 *     shell terminal in its first (and only) tab.
 *
 * Creation itself runs in the main process (`workspace.create`); this component
 * keeps the resulting `{ workspace, layout }` so the pane can bind its terminal
 * to the workspace + its default area.
 */
import { useEffect, useState } from 'react'
import { Pane, Window, WorkspaceDialog } from '@renderer/components'
import { SURFACE_META } from '@renderer/surfaces'
import type { CreateWorkspaceResult } from '@shared/ipc'

export function App() {
  const [created, setCreated] = useState<CreateWorkspaceResult | null>(null)
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
    setCreated(result)
    setDialogOpen(false)
  }

  if (created) {
    const { workspace, layout } = created
    const areaId = layout.areas[0]?.id ?? 'area-default'
    return (
      <Window
        workspace={workspace.name}
        dir={workspace.backend.cwd}
        backendBadge="host"
        backendLabel="host"
      >
        <div className="col">
          <div className="row">
            <Pane meta={SURFACE_META.terminal} focused workspaceId={workspace.id} areaId={areaId} />
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
