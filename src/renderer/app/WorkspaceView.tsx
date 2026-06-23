/**
 * The live surface of one workspace: owns its {@link LayoutEngine} (via
 * `useLayout`) and renders the pane/tab tree (M-J1-S3). Mounted only once a
 * workspace exists and keyed by its id, so each workspace gets a fresh engine.
 *
 * Holds the split keymap: ⌘D splits the focused pane vertically into a new
 * editor pane (P-split-v), which then opens a host file (AC1.2 → AC2.2).
 */
import { useEffect } from 'react'
import { LayoutView, useLayout } from '@renderer/layout'
import type { CreateWorkspaceResult } from '@shared/ipc'

interface WorkspaceViewProps {
  created: CreateWorkspaceResult
}

export function WorkspaceView({ created }: WorkspaceViewProps) {
  const { workspace, layout } = created
  const { snapshot, engine, actions } = useLayout(layout)

  useEffect(() => {
    // Capture phase: intercept ⌘D before the focused surface (xterm/CodeMirror)
    // can swallow it, and stop it from reaching the terminal as a keystroke.
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        e.stopPropagation()
        const focused = engine.focusedPaneId
        if (focused) {
          engine.splitVertical(focused, 'editor')
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [engine])

  return (
    <LayoutView
      snapshot={snapshot}
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      actions={actions}
    />
  )
}
