/**
 * Shared Electron-launch helpers for the e2e suite.
 *
 * Every test gets its OWN `--user-data-dir` so persisted workspaces (J1-S6 boot
 * restore) can't leak between tests or across runs — without this, one test's
 * created workspace would be restored on the next test's boot and break its
 * empty-state assumptions. The restart test reuses a single dir across two
 * launches to prove the skeleton survives a quit.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication } from '@playwright/test'

const MAIN_ENTRY = resolve('out/main/index.js')

/** A fresh, empty userData directory under the OS temp dir. */
export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'tessera-e2e-'))
}

/**
 * Launch the built app against an isolated (or explicitly provided) userData
 * directory. Pass the same dir to two launches to exercise restore.
 */
export function launchApp(userDataDir: string = freshUserDataDir()): Promise<ElectronApplication> {
  return electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`] })
}
