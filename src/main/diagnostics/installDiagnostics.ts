/**
 * Process-level diagnostics for the main process.
 *
 * Three jobs, all of them about a failure that today leaves no trace in a
 * packaged build:
 *
 * 1. **Boot context.** One line per launch recording version, Electron/Node,
 *    macOS, packaged-or-not, and the resolved PATH. That last one matters more
 *    than it looks: `env/fixPath.ts` exists because a Finder or auto-update
 *    relaunch inherits launchd's stripped PATH, and when that fix misses, the
 *    symptom is an unrelated-looking ENOENT from the `container` CLI or a shell
 *    spawn. Having the PATH in the log turns that into a five-second diagnosis.
 *
 * 2. **Unhandled failures.** `uncaughtException` / `unhandledRejection` in main,
 *    and `child-process-gone` for the utility/GPU/PTY side. Without these, a
 *    rejected promise in an IPC handler is invisible.
 *
 * 3. **Native crashes.** `crashReporter` with `uploadToServer: false` — minidumps
 *    stay on disk under `app.getPath('crashDumps')`. `node-pty` is a native
 *    module; when it segfaults, JS handlers never run and the minidump is the
 *    only artifact that survives.
 */
import { app, crashReporter } from 'electron'
import { parseLevel } from './logFormat'
import { configureLogLevel, log, logDirectoryPath } from './logger'

const boot = log.scope('boot')

/**
 * Install main-process handlers. Call once, as early as possible — before
 * `app.whenReady()` — so a failure during startup is still captured.
 */
export function installDiagnostics(): void {
  configureLogLevel(parseLevel(process.env['TESSERA_LOG_LEVEL'], app.isPackaged ? 'info' : 'debug'))

  // Local-only minidumps. No server, no upload, no consent surface to build.
  crashReporter.start({ uploadToServer: false })

  boot.info('app starting', {
    version: app.getVersion(),
    electron: process.versions['electron'],
    chrome: process.versions['chrome'],
    node: process.versions['node'],
    platform: `${process.platform}-${process.arch}`,
    packaged: app.isPackaged,
    logDirectory: logDirectoryPath(),
    crashDumps: app.getPath('crashDumps')
  })

  process.on('uncaughtException', (error) => {
    boot.error('uncaught exception in main', { error: String(error?.stack ?? error) })
  })

  process.on('unhandledRejection', (reason) => {
    boot.error('unhandled rejection in main', { reason: String(reason) })
  })

  app.on('child-process-gone', (_event, details) => {
    // `details.type` covers GPU, utility, and the Pepper/renderer helpers. A
    // node-pty segfault surfaces here before the minidump lands.
    boot.error('child process gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName ?? null
    })
  })

  app.on('before-quit', () => {
    boot.info('app quitting')
  })
}

/**
 * Log the PATH once the login-shell fix has run. Separate from
 * {@link installDiagnostics} because ordering is the whole point: `fixPath` runs
 * before `app.whenReady`, and logging the PATH *after* it is what makes a
 * stripped-PATH launch diagnosable.
 */
export function logResolvedPath(): void {
  boot.info('resolved PATH', { path: process.env['PATH'] ?? '' })
}
