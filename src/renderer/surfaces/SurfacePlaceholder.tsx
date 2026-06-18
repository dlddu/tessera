/**
 * Non-functional placeholder for a component surface. Shows the surface's
 * identity dot + label + an explicit "not implemented" note. Real surfaces
 * (terminal/browser/editor/Claude) replace this in feature work.
 */
import type { SurfaceMeta } from './registry'

export function SurfacePlaceholder({ meta }: { meta: SurfaceMeta }) {
  return (
    <div className="surface-stub" data-kind={meta.dataKind}>
      <span className="surface-stub__dot" style={{ background: `var(${meta.identityVar})` }} />
      <div className="surface-stub__label">{meta.label}</div>
      <div className="surface-stub__note">미구현 · not implemented</div>
    </div>
  )
}
