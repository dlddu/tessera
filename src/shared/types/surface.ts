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
