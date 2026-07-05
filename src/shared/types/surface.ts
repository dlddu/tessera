/**
 * Component surface types (PRD-1). One tab holds exactly one surface.
 */

/** The four component kinds Tessera multiplexes. AC1.1, #1. */
export type SurfaceKind = 'terminal' | 'browser' | 'editor' | 'claude'

/** Stable iteration order used by the shell and tests. */
export const SURFACE_KINDS: readonly SurfaceKind[] = [
  'terminal',
  'editor',
  'browser',
  'claude'
] as const

/**
 * Default title a freshly created tab of each surface kind gets. The single
 * source of truth for both tab-creation paths: the workspace factory's first
 * tab and the layout engine's split/add-tab (no scattered per-surface strings).
 */
export function defaultTitle(surface: SurfaceKind): string {
  switch (surface) {
    case 'terminal':
      return 'zsh'
    case 'editor':
      return 'untitled'
    case 'browser':
      return 'Browser'
    case 'claude':
      return 'Claude Code'
  }
}
