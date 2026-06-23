/**
 * The live surface of one workspace: owns its {@link LayoutEngine} (via
 * `useLayout`) and renders the pane/tab tree (M-J1-S3+). Mounted only once a
 * workspace exists and keyed by its id, so each workspace gets a fresh engine.
 *
 * Holds the surface-creation keymap. Every creation path runs through the shared
 * {@link SurfacePicker} (M-J1-S4, AC1.1): ⌘D opens it to split the focused pane
 * vertically (P-split-v, a new column), ⌘⇧D to split it horizontally (a new
 * row), and the pane "+" opens it to add a tab. Repeated splits compose the
 * 2×2 mosaic (AC1.2). The chosen kind drives the matching engine mutation.
 */
import { useCallback, useEffect, useState } from 'react'
import { LayoutView, useLayout } from '@renderer/layout'
import { SurfacePicker } from '@renderer/components'
import type { CreateWorkspaceResult } from '@shared/ipc'
import type { SurfaceKind } from '@shared/types'

interface WorkspaceViewProps {
  created: CreateWorkspaceResult
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

export function WorkspaceView({ created }: WorkspaceViewProps) {
  const { workspace, layout } = created
  const { snapshot, engine, actions } = useLayout(layout)
  const [pending, setPending] = useState<PendingPick | null>(null)

  useEffect(() => {
    // ⌘D / ⌘⇧D (Cmd only) open the picker to split the focused pane — vertically
    // into a new column (P-split-v) or horizontally into a new row. Captured
    // before the focused surface so xterm/CodeMirror can't swallow it. Ctrl is
    // excluded so Ctrl+D still reaches the terminal as EOF.
    function onKey(e: KeyboardEvent) {
      if (e.metaKey && !e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        e.stopPropagation()
        const focused = engine.focusedPaneId
        if (focused) {
          setPending({ action: e.shiftKey ? 'split-h' : 'split-v', paneId: focused })
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [engine])

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
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        actions={actions}
        onRequestAddTab={requestAddTab}
      />
      {pending ? (
        <SurfacePicker title={PICKER_TITLE[pending.action]} onPick={pick} onCancel={cancelPick} />
      ) : null}
    </>
  )
}
