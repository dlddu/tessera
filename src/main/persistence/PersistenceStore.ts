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
 * That tolerance is why this module logs. Every failure mode here degrades to
 * the *same* observable outcome — a workspace that reopens with a default
 * layout — so without a trace, "내 레이아웃이 사라졌다" is indistinguishable
 * between a never-written file, a truncated write, a schema we can't migrate,
 * and a host area that restore deliberately dropped (AC2.7). The logger is
 * injected (see {@link SnapshotLogger}) rather than imported so this file stays
 * Electron-free and unit-testable against a temp dir.
 *
 * The store takes its base directory as a constructor argument so it stays free
 * of Electron and can be exercised against a temp dir in unit tests; the main
 * process passes `app.getPath('userData')`.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  WORKSPACE_SNAPSHOT_VERSION,
  describeLayout,
  migrateWorkspaceSnapshot,
  stripHostAreas
} from '@shared/types'
import type { WorkspaceStateSnapshot } from '@shared/types'

/** Suffix every persisted workspace file carries. */
const SNAPSHOT_EXT = '.json'

/**
 * The slice of the diagnostics `Logger` this store needs. Declared structurally
 * so `log.scope('persist')` satisfies it without this module importing
 * `@main/diagnostics` — which would drag Electron into a unit-tested file.
 */
export interface SnapshotLogger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

/** Default for tests and any caller that doesn't want a trace. */
const SILENT: SnapshotLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
}

/**
 * Why a persisted file did not restore. `missing` is the ordinary case (first
 * boot, closed workspace); everything else is state loss worth a warning.
 */
export type SnapshotRejection = 'missing' | 'unreadable' | 'malformed' | 'unmigratable' | 'invalid'

/** A snapshot that survived parse + migration + validation, with its provenance. */
interface ParsedSnapshot {
  snapshot: WorkspaceStateSnapshot
  /** Schema version the file carried on disk (< current means it was migrated). */
  diskVersion: number
  /** Whether restore dropped a host-only area (AC2.7) — panes the user will not see. */
  strippedHostArea: boolean
}

type ParseResult = { ok: true; value: ParsedSnapshot } | { ok: false; reason: SnapshotRejection }

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
 * Parse raw JSON into a restorable snapshot, or a reason it isn't one. Older
 * (but recognized) versions are migrated up to the current schema first, then
 * validated — so a J1-S6 layout loads under J1-S7 with zoom defaulted off.
 *
 * The reason is the point: each branch used to return the same `null`, which is
 * exactly the information the load path needs to report.
 */
function parseSnapshot(raw: string): ParseResult {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const diskVersion =
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { version?: unknown }).version === 'number'
      ? (value as { version: number }).version
      : -1

  const migrated = migrateWorkspaceSnapshot(value)
  if (migrated === null) return { ok: false, reason: 'unmigratable' }
  if (!isRestorable(migrated)) return { ok: false, reason: 'invalid' }

  // A host-only area (AC2.7) is live-session state: its host backend isn't
  // re-registered on boot, so restore drops it and reopens container-only —
  // otherwise the restored host terminals would have no backend to spawn
  // against. Full host-area restore is deferred to J4.
  const layout = stripHostAreas(migrated.layout)
  return {
    ok: true,
    value: {
      snapshot: { ...migrated, layout },
      diskVersion,
      strippedHostArea: layout !== migrated.layout
    }
  }
}

export class PersistenceStore {
  constructor(
    private readonly baseDir: string,
    private readonly logger: SnapshotLogger = SILENT
  ) {}

  /** Directory holding one JSON file per workspace. */
  private get workspacesDir(): string {
    return join(this.baseDir, 'workspaces')
  }

  /** Absolute path of a workspace's snapshot file. */
  private fileFor(workspaceId: string): string {
    return join(this.workspacesDir, `${workspaceId}${SNAPSHOT_EXT}`)
  }

  /**
   * What a completed write carried. Shape (not content) plus size and duration:
   * enough to tell a real save from an empty one, and to catch an autosave that
   * has quietly started costing tens of milliseconds on every keystroke's
   * debounce.
   */
  private writeFields(
    snapshot: WorkspaceStateSnapshot,
    bytes: number,
    startedAt: number
  ): Record<string, unknown> {
    return {
      workspaceId: snapshot.workspaceId,
      ...describeLayout(snapshot.layout),
      surfaces: snapshot.surfaces?.length ?? 0,
      bytes,
      ms: Date.now() - startedAt
    }
  }

  /** Persist a workspace snapshot (atomic write via temp file + rename). */
  async save(snapshot: WorkspaceStateSnapshot): Promise<void> {
    const startedAt = Date.now()
    const dir = this.workspacesDir
    const target = this.fileFor(snapshot.workspaceId)
    const tmp = `${target}.${process.pid}.tmp`
    const json = JSON.stringify(snapshot, null, 2)

    try {
      await mkdir(dir, { recursive: true })
      await writeFile(tmp, json, 'utf8')
      await rename(tmp, target)
    } catch (error) {
      // Rethrown (the IPC caller's contract is unchanged), but logged here so a
      // failing save leaves a trace even though the renderer only `void`s the
      // promise — a silent failure here is state loss the user learns about at
      // the next boot.
      this.logger.error('layout snapshot save failed', {
        workspaceId: snapshot.workspaceId,
        target,
        error: String(error)
      })
      throw error
    }

    this.logger.debug(
      'layout snapshot saved',
      this.writeFields(snapshot, Buffer.byteLength(json), startedAt)
    )
  }

  /**
   * Synchronous {@link save} for the app-quit flush: the renderer's
   * `beforeunload` runs the last persist through `sendSync`, which can't wait on
   * a promise. Same atomic temp-file + rename, blocking the quit until it lands.
   */
  saveSync(snapshot: WorkspaceStateSnapshot): void {
    const startedAt = Date.now()
    const dir = this.workspacesDir
    const target = this.fileFor(snapshot.workspaceId)
    const tmp = `${target}.${process.pid}.sync.tmp`
    const json = JSON.stringify(snapshot, null, 2)

    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(tmp, json, 'utf8')
      renameSync(tmp, target)
    } catch (error) {
      // The quit flush is the one save with no second chance: the window is
      // going away, so whatever it fails to write is simply gone.
      this.logger.error('layout snapshot quit-flush failed', {
        workspaceId: snapshot.workspaceId,
        target,
        error: String(error)
      })
      throw error
    }

    // Info, not debug: this is the last write of the session, and the line that
    // tells you whether the state you expected to come back was ever on disk.
    this.logger.info('layout snapshot flushed on quit', {
      ...this.writeFields(snapshot, Buffer.byteLength(json), startedAt),
      sync: true
    })
  }

  /**
   * Load the last persisted snapshot for a workspace, or null if there is none
   * (missing file, unreadable, corrupt, or an unsupported schema version).
   */
  async load(workspaceId: string): Promise<WorkspaceStateSnapshot | null> {
    const result = await this.read(workspaceId)
    return result.ok ? result.value.snapshot : null
  }

  /**
   * {@link load}'s logging core: reads, parses, and reports what happened.
   * Split out so {@link list} can reuse the parse without re-reading the file
   * and without double-logging.
   */
  private async read(workspaceId: string): Promise<ParseResult> {
    const file = this.fileFor(workspaceId)
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      // ENOENT is the normal first-boot / closed-workspace path, not a fault.
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
      if (missing) {
        this.logger.debug('no layout snapshot on disk', { workspaceId })
        return { ok: false, reason: 'missing' }
      }
      this.logger.warn('layout snapshot unreadable', {
        workspaceId,
        file,
        error: String(error)
      })
      return { ok: false, reason: 'unreadable' }
    }

    const result = parseSnapshot(raw)
    if (!result.ok) {
      // The file existed and we're still not restoring it: the user's layout is
      // on disk and about to be ignored. Always worth a warning with the reason.
      this.logger.warn('layout snapshot rejected; workspace will reopen fresh', {
        workspaceId,
        file,
        reason: result.reason,
        bytes: Buffer.byteLength(raw),
        expectedVersion: WORKSPACE_SNAPSHOT_VERSION
      })
      return result
    }

    const { snapshot, diskVersion, strippedHostArea } = result.value
    this.logger.debug('layout snapshot restored', {
      workspaceId,
      ...describeLayout(snapshot.layout),
      surfaces: snapshot.surfaces?.length ?? 0,
      savedAt: new Date(snapshot.savedAt).toISOString(),
      ...(diskVersion !== WORKSPACE_SNAPSHOT_VERSION
        ? { migratedFrom: diskVersion, to: WORKSPACE_SNAPSHOT_VERSION }
        : {})
    })
    if (strippedHostArea) {
      // Deliberate (AC2.7) but user-visible as missing panes — say so, or it
      // reads as a restore bug.
      this.logger.info('host-only area dropped on restore (AC2.7)', { workspaceId })
    }
    return result
  }

  /**
   * Permanently delete a workspace's persisted snapshot (workspace close,
   * AC1.7) so it does not come back on the next boot restore. Idempotent: an
   * already-absent file (never saved, or closed twice) resolves rather than
   * throwing.
   */
  async delete(workspaceId: string): Promise<void> {
    try {
      await rm(this.fileFor(workspaceId))
      this.logger.info('layout snapshot deleted (workspace closed)', { workspaceId })
    } catch (error) {
      // ENOENT or otherwise already gone — closing leaves nothing behind either way.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('layout snapshot delete failed; it may restore again', {
          workspaceId,
          error: String(error)
        })
      }
    }
  }

  /**
   * Every restorable workspace snapshot, newest (highest `savedAt`) first —
   * the head is the workspace to activate on boot (J1-S6). Corrupt or
   * wrong-version files are skipped; a missing directory yields an empty list.
   */
  async list(): Promise<WorkspaceStateSnapshot[]> {
    const startedAt = Date.now()
    let files: string[]
    try {
      files = await readdir(this.workspacesDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.info('no persisted workspaces (first run)', { dir: this.workspacesDir })
      } else {
        this.logger.warn('workspace directory unreadable; starting empty', {
          dir: this.workspacesDir,
          error: String(error)
        })
      }
      return [] // No workspaces dir yet → nothing persisted.
    }

    const snapshots: WorkspaceStateSnapshot[] = []
    const skipped: string[] = []
    for (const file of files) {
      if (!file.endsWith(SNAPSHOT_EXT)) continue // skips in-flight *.tmp writes
      const workspaceId = file.slice(0, -SNAPSHOT_EXT.length)
      const result = await this.read(workspaceId)
      if (result.ok) snapshots.push(result.value.snapshot)
      else skipped.push(workspaceId)
    }
    snapshots.sort((a, b) => b.savedAt - a.savedAt)

    // The one line that answers "what did this boot actually restore?". Every
    // per-file detail is already logged above; this is the summary a bug report
    // starts from.
    this.logger.info('boot restore scan complete', {
      restored: snapshots.length,
      skipped: skipped.length,
      ...(skipped.length > 0 ? { skippedIds: skipped } : {}),
      activate: snapshots[0]?.workspaceId ?? null,
      ms: Date.now() - startedAt
    })
    return snapshots
  }
}
