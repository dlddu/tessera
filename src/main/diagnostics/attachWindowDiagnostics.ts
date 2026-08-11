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
 * The escape hatch is deliberate: `Cmd+Alt+I` toggles DevTools even in a
 * packaged build, and `Cmd+Alt+L` reveals the log directory in Finder. Bound per
 * window via `before-input-event` rather than `globalShortcut`, which would
 * steal the chord from every other app while Tessera runs.
 */
import { shell, type BrowserWindow, type WebContents } from 'electron'
import { consoleLevelToLogLevel, shortenSource } from './logFormat'
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
 * Window-scoped debug chords, live in packaged builds too (Electron's built-in
 * DevTools accelerator is dev-only). Handled on `keyDown` so a chord fires once.
 */
function installDebugShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown' || !input.meta || !input.alt) {
      return
    }
    const key = input.key.toLowerCase()
    if (key === 'i') {
      const contents = win.webContents
      if (contents.isDevToolsOpened()) {
        contents.closeDevTools()
      } else {
        contents.openDevTools({ mode: 'detach' })
      }
      return
    }
    if (key === 'l') {
      window.info('revealing log directory')
      void shell.openPath(logDirectoryPath())
    }
  })
}
