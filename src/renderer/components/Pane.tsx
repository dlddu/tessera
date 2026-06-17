/**
 * C-pane (tile): identity stripe (via `data-kind`) + a single-tab tab bar +
 * a placeholder body. Splitting, tab move/reorder, resize are not implemented.
 */
import { SurfacePlaceholder } from '@renderer/surfaces'
import type { SurfaceMeta } from '@renderer/surfaces'

export function Pane({ meta, focused = false }: { meta: SurfaceMeta; focused?: boolean }) {
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
        <SurfacePlaceholder meta={meta} />
      </div>
    </div>
  )
}
