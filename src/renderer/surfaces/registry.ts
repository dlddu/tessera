/**
 * Maps each surface kind to its design-system identity (PRD-1 + design system).
 * `dataKind` matches the `data-kind` values in `tessera.css` (term/edit/web/
 * claude) that drive the 2px identity stripe and 6px dot.
 */
import type { SurfaceKind } from '@shared/types'

export type SurfaceDataKind = 'term' | 'edit' | 'web' | 'claude'

export interface SurfaceMeta {
  kind: SurfaceKind
  dataKind: SurfaceDataKind
  label: string
  /** CSS custom property holding this surface's identity color. */
  identityVar: `--id-${SurfaceDataKind}`
}

export const SURFACE_META: Record<SurfaceKind, SurfaceMeta> = {
  terminal: { kind: 'terminal', dataKind: 'term', label: 'Terminal', identityVar: '--id-term' },
  editor: { kind: 'editor', dataKind: 'edit', label: 'Editor', identityVar: '--id-edit' },
  browser: { kind: 'browser', dataKind: 'web', label: 'Browser', identityVar: '--id-web' },
  claude: { kind: 'claude', dataKind: 'claude', label: 'Claude Code', identityVar: '--id-claude' }
}
