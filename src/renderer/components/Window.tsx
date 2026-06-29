/**
 * C-window: macOS-style window frame. Title bar (workspace name, backend badge)
 * + grout surface (children) + status bar, plus an optional `overlay` slot for
 * modal scrims (rendered inside the positioned `.win` so the scrim covers
 * exactly the window). On macOS the native traffic lights are drawn into the
 * inset title bar; the bar reserves space for them (`.is-mac .titlebar`) rather
 * than rendering its own decorative dots.
 */
import type { ReactNode } from 'react'
import { StatusBar } from './StatusBar'

interface WindowProps {
  /** Workspace name, or `null` for the empty (no-workspace) state. */
  workspace: string | null
  /** Host working directory shown in the title bar (when a workspace exists). */
  dir?: string
  /** Status-bar backend label (e.g. "host"). */
  backendLabel: string
  /** Title-bar badge text. */
  backendBadge: string
  children: ReactNode
  /** Modal content rendered over the window (e.g. a dialog scrim). */
  overlay?: ReactNode
  /** Pending update version when one is downloaded and ready to install. */
  updateReadyVersion?: string | null
  /** Invoked when the user clicks the status-bar "restart to update" affordance. */
  onUpdateRestart?: (() => void) | undefined
  /** Whether a pane is zoomed to fill the window — shows the title-bar badge (AC1.6). */
  zoomed?: boolean
}

export function Window({
  workspace,
  dir,
  backendLabel,
  backendBadge,
  children,
  overlay,
  updateReadyVersion = null,
  onUpdateRestart,
  zoomed = false
}: WindowProps) {
  const empty = workspace === null
  return (
    <div className="win">
      <div className="titlebar">
        <div className="ws">
          {empty ? (
            <span className="muted">새 워크스페이스</span>
          ) : (
            <>
              {workspace}
              {dir ? <span className="dir">{dir}</span> : null}
            </>
          )}
        </div>
        <div className="right">
          {zoomed ? (
            <span className="badge zoom" data-testid="zoom-badge">
              <span className="led" />⤢ 전체화면
            </span>
          ) : null}
          <span className="badge host">
            <span className="led" />
            {backendBadge}
          </span>
        </div>
      </div>
      <div className="surface">{children}</div>
      <StatusBar
        workspace={workspace}
        backend={backendLabel}
        updateReadyVersion={updateReadyVersion}
        onUpdateRestart={onUpdateRestart}
      />
      {overlay}
    </div>
  )
}
