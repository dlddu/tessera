/**
 * Host-side state persistence (PRD-4). Restore state is written to a host-side
 * store, independent of backend/app lifetime (AC4.5).
 *
 * M-J1-S1 implements `save` only — an atomic per-workspace JSON write under
 * `<baseDir>/workspaces/<id>.json`. `load` and write debouncing remain stubs
 * for later journeys (J4). The store takes its base directory as a constructor
 * argument so it stays free of Electron and can be exercised against a temp
 * dir in unit tests; the main process passes `app.getPath('userData')`.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NotImplementedError } from '@shared/errors'
import type { WorkspaceStateSnapshot } from '@shared/types'

export class PersistenceStore {
  // TODO(feature): debounce timer to coalesce frequent saves (J4).
  constructor(private readonly baseDir: string) {}

  /** Directory holding one JSON file per workspace. */
  private get workspacesDir(): string {
    return join(this.baseDir, 'workspaces')
  }

  /** Persist a workspace snapshot (atomic write; debounced in J4). */
  async save(snapshot: WorkspaceStateSnapshot): Promise<void> {
    const dir = this.workspacesDir
    await mkdir(dir, { recursive: true })

    const target = join(dir, `${snapshot.workspaceId}.json`)
    const tmp = `${target}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
    await rename(tmp, target)
  }

  /** Load the last persisted snapshot for a workspace, or null if none. */
  load(_workspaceId: string): Promise<WorkspaceStateSnapshot | null> {
    throw new NotImplementedError('PersistenceStore.load')
  }
}
