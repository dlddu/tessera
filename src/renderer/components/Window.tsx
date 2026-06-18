/**
 * C-window: macOS-style window frame. Decorative title bar (traffic lights,
 * workspace name, backend badge) + grout surface (children) + status bar.
 * Native macOS traffic-light integration is a next step.
 */
import type { ReactNode } from 'react'
import { StatusBar } from './StatusBar'

interface WindowProps {
  workspace: string
  /** Status-bar backend label (e.g. "host · stub"). */
  backendLabel: string
  /** Title-bar badge text. */
  backendBadge: string
  children: ReactNode
}

export function Window({ workspace, backendLabel, backendBadge, children }: WindowProps) {
  return (
    <div className="win">
      <div className="titlebar">
        <div className="lights">
          <i />
          <i />
          <i />
        </div>
        <div className="ws">
          {workspace}
          <span className="dir">~/{workspace}</span>
        </div>
        <div className="right">
          <span className="badge host">
            <span className="led" />
            {backendBadge}
          </span>
        </div>
      </div>
      <div className="surface">{children}</div>
      <StatusBar workspace={workspace} backend={backendLabel} />
    </div>
  )
}
