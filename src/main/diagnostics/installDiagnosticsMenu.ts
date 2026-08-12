/**
 * A Debug menu carrying the diagnostics affordances.
 *
 * Electron documents menu items as *the* way to bind a local keyboard shortcut:
 * the accelerator is handled natively, so it dodges two traps that sank the
 * earlier `before-input-event` binding —
 *
 * 1. On macOS the Option key composes, so `KeyboardEvent.key` for Option+L is
 *    `¬`, never `l`. Accelerator strings don't go through that mapping.
 * 2. `before-input-event` only fires for the webContents that has focus. Tessera
 *    hosts browser surfaces in their own `WebContentsView`, so a chord pressed
 *    while a browser tab is focused never reaches the main window at all. A menu
 *    accelerator is application-wide.
 *
 * The item is also simply *discoverable* — a chord nobody remembers is a chord
 * nobody uses, and this one exists to be reached at an awkward moment.
 *
 * DevTools deliberately isn't here: the app never calls `setApplicationMenu`, so
 * Electron's default menu is in place and its View submenu already binds
 * `toggleDevTools` to `Cmd+Alt+I`, packaged builds included.
 */
import { Menu, MenuItem, clipboard, shell } from 'electron'
import { log, logDirectoryPath, logFilePath } from './logger'

const menuLog = log.scope('menu')

/**
 * Append the Debug menu to the application menu. Call after `app.whenReady()` —
 * Electron installs its default menu during startup, and this builds on it
 * rather than replacing it (replacing would mean re-declaring every standard
 * editing and window shortcut by hand).
 */
export function installDiagnosticsMenu(): void {
  const existing = Menu.getApplicationMenu()
  if (existing === null) {
    // Only reachable if a custom menu is introduced and set to null; the chord
    // backstop in attachWindowDiagnostics still covers the common case.
    menuLog.warn('no application menu to extend; Debug menu not installed')
    return
  }

  const debugMenu = new MenuItem({
    label: 'Debug',
    submenu: [
      {
        label: 'Reveal Log Folder',
        accelerator: 'Command+Alt+L',
        click: () => {
          menuLog.info('revealing log directory (menu)')
          void shell.openPath(logDirectoryPath())
        }
      },
      {
        label: 'Copy Log File Path',
        click: () => {
          // Cheaper to paste into a terminal than to navigate Finder when what
          // you actually want is to `tail -f` it.
          const path = logFilePath()
          menuLog.info('copied log file path', { path })
          clipboard.writeText(path)
        }
      }
    ]
  })

  // Rebuild rather than mutating the live menu: `Menu.append` on an already-set
  // menu isn't guaranteed to refresh the native menu bar on macOS.
  const next = new Menu()
  for (const item of existing.items) {
    next.append(item)
  }
  next.append(debugMenu)
  Menu.setApplicationMenu(next)

  menuLog.info('Debug menu installed', { logDirectory: logDirectoryPath() })
}
