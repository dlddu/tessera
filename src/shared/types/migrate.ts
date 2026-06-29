/**
 * Forward migration for persisted {@link WorkspaceStateSnapshot}s (PRD-4).
 *
 * Older on-disk snapshots are upgraded to {@link WORKSPACE_SNAPSHOT_VERSION}
 * before they are validated and restored, instead of being discarded. Each
 * entry in {@link MIGRATORS} is a single version→version+1 transform; the
 * pipeline applies them in sequence (v2→v3→…) until the snapshot reaches the
 * current version. A version with no migrator — or one newer than we know — has
 * no safe upgrade path and is rejected (the loader treats that as "no snapshot",
 * exactly as a corrupt file).
 *
 * NOTE (pre-J4): this scaffold exists so the zoom field (J1-S7) could be added
 * without dropping J1-S6 layouts. Full content-state migration is J4's concern;
 * only the minimal version→version map needed today lives here.
 */
import { WORKSPACE_SNAPSHOT_VERSION } from './persistence'

/** A loosely-typed snapshot in transit — fields are untrusted until validated. */
type RawSnapshot = Record<string, unknown>

/** Upgrades a snapshot from version `N` to version `N + 1`. */
type Migrator = (snapshot: RawSnapshot) => RawSnapshot

/**
 * Map of `fromVersion → migrator`. Keyed by the version the migrator consumes;
 * each must stamp the next version on its output so the pipeline can advance.
 */
const MIGRATORS: Record<number, Migrator> = {
  // v2 → v3: pane zoom (AC1.6) joined the layout skeleton. Pre-zoom skeletons
  // had no zoom, so the upgrade simply seeds `layout.zoomedPaneId = null`.
  2: (snapshot) => {
    const layout = snapshot.layout
    const nextLayout =
      typeof layout === 'object' && layout !== null
        ? { ...(layout as RawSnapshot), zoomedPaneId: null }
        : layout
    return { ...snapshot, version: 3, layout: nextLayout }
  }
}

/**
 * Upgrade a parsed snapshot to the current schema version, or return `null` if
 * it can't be upgraded (too old with a gap in the chain, newer than known, or
 * not a versioned object). The result still needs shape validation by the
 * caller — migration fills in new fields but doesn't vouch for the rest.
 */
export function migrateWorkspaceSnapshot(value: unknown): unknown | null {
  if (typeof value !== 'object' || value === null) return null
  let current = value as RawSnapshot
  if (typeof current.version !== 'number') return null
  // Already current (or a newer file we can't safely down-level): pass current
  // through untouched, reject anything ahead of us.
  if (current.version > WORKSPACE_SNAPSHOT_VERSION) return null

  while (typeof current.version === 'number' && current.version < WORKSPACE_SNAPSHOT_VERSION) {
    const migrate = MIGRATORS[current.version]
    if (!migrate) return null // no path forward from this version
    current = migrate(current)
  }
  return current
}
