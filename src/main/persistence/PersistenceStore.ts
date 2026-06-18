/**
 * Host-side state persistence (PRD-4). Restore state is written to a host-side
 * store, independent of backend/app lifetime (AC4.5), debounced to limit perf
 * impact.
 *
 * Skeleton stub — both operations throw.
 *   - save → debounced/incremental write to host store (debounce slot TODO)
 *   - load → read persisted snapshot on app start / reconnect
 */
import { NotImplementedError } from '@shared/errors'
import type { WorkspaceStateSnapshot } from '@shared/types'

export class PersistenceStore {
  // TODO(feature): debounce timer + host store path live here.

  /** Persist a workspace snapshot (debounced in the real implementation). */
  save(_snapshot: WorkspaceStateSnapshot): Promise<void> {
    throw new NotImplementedError('PersistenceStore.save')
  }

  /** Load the last persisted snapshot for a workspace, or null if none. */
  load(_workspaceId: string): Promise<WorkspaceStateSnapshot | null> {
    throw new NotImplementedError('PersistenceStore.load')
  }
}
