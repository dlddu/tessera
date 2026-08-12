/**
 * Window-scoped diagnostics: make the renderer audible, and leave a way in.
 *
 * In a packaged build the renderer is a black box — DevTools is closed, so every
 * `console.error`, React error boundary, and failed `loadFile` goes nowhere. The
 * relay below forwards the renderer's console into the main-process log file, so
 * `console.warn` in a component is enough to leave a durable trace; no new IPC
 * contract and no import needed in renderer code.
 *
 * Three failures get their own handlers because they're the ones that produce a
 * blank window with no console at all:
 *
 * - `preload-error` — the preload threw, so `window.tessera` is undefined and
 *   every bridge call fails. Everything in this app goes through that bridge.
 * - `did-fail-load` — the packaged `loadFile('../renderer/index.html')` missed.
 *   Dev never hits this; it's a bundling/packaging-only failure.
 * - `render-process-gone` — the renderer died, taking its console with it.
 *
 * DevTools needs no wiring here: the app never calls `Menu.setApplicationMenu`,
 * so Electron's default menu is installed, and its View submenu already binds
 * `toggleDevTools` to `Cmd+Alt+I` in packaged builds too.
 *
 * `Cmd+Alt+L` (reveal the log folder) is owned by the menu item in
 * `installDiagnosticsMenu.ts` — the approach Electron documents for local
 * shortcuts, and the only one that survives focus sitting in a browser surface's
 * `WebContentsView`, where this window's `before-input-event` never fires. The
 * handler below is a redundant second path for the common case where focus is in
 * the main renderer. Firing both is harmless: revealing a folder twice just
 * brings the same Finder window forward, unlike a DevTools *toggle*, which is
 * why that one is not duplicated here.
 */
import { shell, type BrowserWindow, type WebContents } from 'electron'
import { consoleLevelToLogLevel, isRevealLogsChord, shortenSource } from './logFormat'
import { log, logDirectoryPath } from './logger'

const renderer = log.scope('renderer')
const window = log.scope('window')

/** Forward one webContents' console into the log file. */
function relayConsole(contents: WebContents, scope: typeof renderer): void {
  contents.on('console-message', (_event, level, message, line, sourceId) => {
    scope[consoleLevelToLogLevel(level)](message, {
      source: `${shortenSource(sourceId)}:${line}`
    })
  })
}

/**
 * Attach diagnostics to the main application window. Call right after
 * {@link createWindow}, before the renderer loads, so a failure during the very
 * first load is still captured.
 */
export function attachWindowDiagnostics(win: BrowserWindow): void {
  const contents = win.webContents

  relayConsole(contents, renderer)

  contents.on('preload-error', (_event, preloadPath, error) => {
    // Fatal in practice: no `window.tessera`, so every bridge call rejects.
    window.error('preload failed to load', {
      preloadPath,
      error: String(error?.stack ?? error)
    })
  })

  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    window.error('renderer failed to load', { errorCode, errorDescription, validatedURL })
  })

  contents.on('render-process-gone', (_event, details) => {
    window.error('render process gone', {
      reason: details.reason,
      exitCode: details.exitCode
    })
  })

  win.on('unresponsive', () => {
    window.warn('window unresponsive')
  })

  win.on('responsive', () => {
    window.info('window responsive again')
  })

  installDebugShortcuts(win)

  // Opt-in DevTools on a packaged launch: `TESSERA_DEBUG=1 open -a Tessera`, or
  // run the binary inside the .app directly with the variable set.
  if (process.env['TESSERA_DEBUG'] === '1') {
    contents.once('did-finish-load', () => {
      contents.openDevTools({ mode: 'detach' })
    })
  }
}

/**
 * Backstop for the reveal-logs chord while the main renderer has focus. See the
 * module header for why this coexists with the menu item, and
 * `isRevealLogsChord` for why matching is on `code` rather than `key`.
 */
function installDebugShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (_event, input) => {
    if (isRevealLogsChord(input)) {
      window.info('revealing log directory (chord)')
      void shell.openPath(logDirectoryPath())
    }
  })
}
