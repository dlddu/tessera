/**
 * C-pane (tile): identity stripe (via `data-kind`) + a single-tab tab bar +
 * a body. A terminal pane renders a live {@link TerminalSurface} (M-J1-S2) when
 * given the workspace/area it belongs to; every other kind still shows the
 * non-functional placeholder. Splitting, tab move/reorder, resize are not
 * implemented.
 */
import { SurfacePlaceholder, TerminalSurface } from '@renderer/surfaces'
import type { SurfaceMeta } from '@renderer/surfaces'

interface PaneProps {
  meta: SurfaceMeta
  focused?: boolean
  /** Set for a live surface; absent panes fall back to the placeholder. */
  workspaceId?: string
  areaId?: string
}

export function Pane({ meta, focused = false, workspaceId, areaId }: PaneProps) {
  const live = meta.kind === 'terminal' && workspaceId !== undefined && areaId !== undefined

  return (
    <div className={focused ? 'pane focused' : 'pane'} data-kind={meta.dataKind}>
      <div className="tabbar">
        <div className="tab active" data-kind={meta.dataKind}>
          <span className="dot" />
          {meta.label}
          <span className="x">×</span>
        </div>
        <span className="add">+</span>
        <div className="spacer" />
      </div>
      <div className="body">
        {live ? (
          <TerminalSurface workspaceId={workspaceId} areaId={areaId} />
        ) : (
          <SurfacePlaceholder meta={meta} />
        )}
      </div>
    </div>
  )
}
