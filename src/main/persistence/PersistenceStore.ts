/**
 * Host-side state persistence (PRD-4). Restore state is written to a host-side
 * store, independent of backend/app lifetime (AC4.5).
 *
 * `save` performs an atomic per-workspace JSON write under
 * `<baseDir>/workspaces/<id>.json`; `saveSync` is its synchronous twin for the
 * app-quit path (the renderer's `beforeunload` can't await a promise). `load`
 * reads one workspace back, and `list` enumerates every persisted workspace for
 * boot restore (J1-S6) — both treat missing / corrupt / wrong-version files as
 * absent rather than throwing, so a bad file can never break startup.
 *
 * The store takes its base directory as a constructor argument so it stays free
 * of Electron and can be exercised against a temp dir in unit tests; the main
 * process passes `app.getPath('userData')`.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WORKSPACE_SNAPSHOT_VERSION, migrateWorkspaceSnapshot } from '@shared/types'
import type { WorkspaceStateSnapshot } from '@shared/types'

/** Suffix every persisted workspace file carries. */
const SNAPSHOT_EXT = '.json'

/**
 * Accept only well-formed snapshots at the current schema version. Older files
 * are upgraded by {@link migrateWorkspaceSnapshot} before they reach here (see
 * {@link parseSnapshot}); anything still off-version, or structurally garbled,
 * is treated as absent. The check stays at the snapshot envelope (version,
 * workspace identity, a layout object) — it deliberately does not reach inside
 * `layout`, which the engine reconstructs and tolerates field-by-field.
 */
function isRestorable(value: unknown): value is WorkspaceStateSnapshot {
  if (typeof value !== 'object' || value === null) return false
  // Treat the parsed JSON as fully optional — it's untrusted on disk, so every
  // field access must tolerate a missing/garbled shape without throwing.
  const snapshot = value as {
    version?: unknown
    workspaceId?: unknown
    savedAt?: unknown
    workspace?: { backend?: { cwd?: unknown } } | null
    layout?: unknown
  }
  return (
    snapshot.version === WORKSPACE_SNAPSHOT_VERSION &&
    typeof snapshot.workspaceId === 'string' &&
    typeof snapshot.savedAt === 'number' &&
    typeof snapshot.workspace === 'object' &&
    snapshot.workspace !== null &&
    typeof snapshot.workspace.backend?.cwd === 'string' &&
    typeof snapshot.layout === 'object' &&
    snapshot.layout !== null
  )
}

/**
 * Parse raw JSON into a restorable snapshot, or null if it isn't one. Older
 * (but recognized) versions are migrated up to the current schema first, then
 * validated — so a J1-S6 layout loads under J1-S7 with zoom defaulted off.
 */
function parseSnapshot(raw: string): WorkspaceStateSnapshot | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const migrated = migrateWorkspaceSnapshot(value)
  return migrated !== null && isRestorable(migrated) ? migrated : null
}

export class PersistenceStore {
  constructor(private readonly baseDir: string) {}

  /** Directory holding one JSON file per workspace. */
  private get workspacesDir(): string {
    return join(this.baseDir, 'workspaces')
  }

  /** Absolute path of a workspace's snapshot file. */
  private fileFor(workspaceId: string): string {
    return join(this.workspacesDir, `${workspaceId}${SNAPSHOT_EXT}`)
  }

  /** Persist a workspace snapshot (atomic write via temp file + rename). */
  async save(snapshot: WorkspaceStateSnapshot): Promise<void> {
    const dir = this.workspacesDir
    await mkdir(dir, { recursive: true })

    const target = this.fileFor(snapshot.workspaceId)
    const tmp = `${target}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
    await rename(tmp, target)
  }

  /**
   * Synchronous {@link save} for the app-quit flush: the renderer's
   * `beforeunload` runs the last persist through `sendSync`, which can't wait on
   * a promise. Same atomic temp-file + rename, blocking the quit until it lands.
   */
  saveSync(snapshot: WorkspaceStateSnapshot): void {
    const dir = this.workspacesDir
    mkdirSync(dir, { recursive: true })

    const target = this.fileFor(snapshot.workspaceId)
    const tmp = `${target}.${process.pid}.sync.tmp`
    writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
    renameSync(tmp, target)
  }

  /**
   * Load the last persisted snapshot for a workspace, or null if there is none
   * (missing file, unreadable, corrupt, or an unsupported schema version).
   */
  async load(workspaceId: string): Promise<WorkspaceStateSnapshot | null> {
    let raw: string
    try {
      raw = await readFile(this.fileFor(workspaceId), 'utf8')
    } catch {
      return null // ENOENT or otherwise unreadable — nothing to restore.
    }
    return parseSnapshot(raw)
  }

  /**
   * Every restorable workspace snapshot, newest (highest `savedAt`) first —
   * the head is the workspace to activate on boot (J1-S6). Corrupt or
   * wrong-version files are skipped; a missing directory yields an empty list.
   */
  async list(): Promise<WorkspaceStateSnapshot[]> {
    let files: string[]
    try {
      files = await readdir(this.workspacesDir)
    } catch {
      return [] // No workspaces dir yet → nothing persisted.
    }

    const snapshots: WorkspaceStateSnapshot[] = []
    for (const file of files) {
      if (!file.endsWith(SNAPSHOT_EXT)) continue // skips in-flight *.tmp writes
      const snapshot = await this.load(file.slice(0, -SNAPSHOT_EXT.length))
      if (snapshot) snapshots.push(snapshot)
    }
    return snapshots.sort((a, b) => b.savedAt - a.savedAt)
  }
}
