/**
 * Host-side persisted state for crash resilience (PRD-4).
 *
 * All restore state is written to a host-side store, debounced, independent of
 * backend/app lifetime (AC4.5). Per-surface content payloads are intentionally
 * loose (`unknown`) at the skeleton stage — feature work narrows them per kind.
 */
import type { LayoutSnapshot, SurfaceKind } from './index'

/** Last-known content for one surface, keyed by its tab id. */
export interface SurfaceStateEntry {
  tabId: string
  surface: SurfaceKind
  /** Surface-specific payload (editor buffer, terminal screen, browser tabs…). */
  content: unknown
}

/** The full restorable state for one workspace. AC4.1–AC4.5. */
export interface WorkspaceStateSnapshot {
  version: number
  workspaceId: string
  /** Layout skeleton (AC1.5) the content is restored onto. */
  layout: LayoutSnapshot
  /** Per-surface last-known content. */
  surfaces: SurfaceStateEntry[]
  /** Epoch ms of the last persist. */
  savedAt: number
}
