/**
 * Layout engine placeholder (PRD-1, AC1.5). Real implementation owns the live
 * window/pane/tab tree and its mutations (split, resize, tab move, focus).
 *
 * Skeleton stub — serialize/restore throw. Signatures are the contract that
 * PRD-4 content restoration layers on top of.
 */
import { NotImplementedError } from '@shared/errors'
import type { LayoutSnapshot } from '@shared/types'

export class LayoutEngine {
  /** Capture the current window/pane/tab skeleton. AC1.5. */
  serialize(): LayoutSnapshot {
    throw new NotImplementedError('LayoutEngine.serialize')
  }

  /** Rebuild the layout from a serialized snapshot. AC1.5. */
  restore(_snapshot: LayoutSnapshot): void {
    throw new NotImplementedError('LayoutEngine.restore')
  }
}
