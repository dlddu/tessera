/**
 * Reflect the user's login-shell PATH into the main process (macOS launch fix).
 *
 * A macOS app launched from Finder/Dock — or **relaunched by the auto-updater**
 * (`autoUpdater.quitAndInstall()` → Squirrel.Mac) — inherits launchd's minimal
 * PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), not the user's login-shell PATH. So
 * CLI tools installed under Homebrew's `/opt/homebrew/bin` or `/usr/local/bin`
 * (e.g. the Apple `container` CLI) aren't resolvable, and `execFile('container',
 * …)` fails with ENOENT even though it works in the terminal. It shows up right
 * after an update because that self-relaunch is exactly the stripped-PATH case;
 * a manual restart from the user's normal launch path clears it.
 *
 * At startup we ask the login shell for its PATH once and merge it into
 * `process.env.PATH`, so every child process the app spawns (the `container`
 * CLI, node-pty shells) resolves tools exactly as the terminal does. macOS-only;
 * if the shell probe fails we still prepend the common install dirs below.
 */
import { execFileSync } from 'node:child_process'

/** Unique sentinel bracketing the printed PATH so shell rc noise can't confuse parsing. */
const DELIMITER = '__TESSERA_PATH__'

/**
 * Common CLI install dirs a macOS GUI/updater launch omits. Used to backfill the
 * login-shell PATH, and as the sole fallback when the shell probe fails.
 */
const FALLBACK_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'] as const

/**
 * Ask the user's login + interactive shell for its PATH, or null on any failure.
 * The `-ilc` shell reads both login (`.zprofile`/`.profile`) and interactive
 * (`.zshrc`/`.bashrc`) rc files, which is where Homebrew/`container` typically
 * extend PATH. A 3s timeout guards against a slow or hanging rc.
 */
function readLoginShellPath(): string | null {
  const shell = process.env['SHELL']
  if (!shell) {
    return null
  }

  let out: string
  try {
    out = execFileSync(shell, ['-ilc', `printf '%s' "${DELIMITER}\${PATH}${DELIMITER}"`], {
      encoding: 'utf8',
      timeout: 3000
    })
  } catch (error) {
    // A non-zero exit from an unrelated rc quirk may still have printed PATH to
    // stdout before failing — salvage it; otherwise give up (→ fallback dirs).
    const stdout = (error as { stdout?: unknown } | null)?.stdout
    if (typeof stdout !== 'string') {
      return null
    }
    out = stdout
  }

  const start = out.indexOf(DELIMITER)
  const end = start === -1 ? -1 : out.indexOf(DELIMITER, start + DELIMITER.length)
  if (start === -1 || end === -1) {
    return null
  }
  const path = out.slice(start + DELIMITER.length, end)
  return path.length > 0 ? path : null
}

/**
 * Merge the login-shell PATH, the fallback install dirs, and the current PATH
 * into one order-preserving, de-duplicated PATH string. Shell entries lead (they
 * mirror the terminal), then the fallback dirs guarantee the common install
 * locations, then whatever was already on PATH is retained. Exported for tests.
 */
export function buildFixedPath(
  currentPath: string,
  shellPath: string | null,
  fallbackDirs: readonly string[] = FALLBACK_DIRS
): string {
  const ordered = [
    ...(shellPath ? shellPath.split(':') : []),
    ...fallbackDirs,
    ...currentPath.split(':')
  ]

  const seen = new Set<string>()
  const merged: string[] = []
  for (const dir of ordered) {
    if (dir && !seen.has(dir)) {
      seen.add(dir)
      merged.push(dir)
    }
  }
  return merged.join(':')
}

/**
 * Apply {@link buildFixedPath} to `process.env.PATH`. No-op off macOS (Linux GUI
 * launches inherit the shell PATH; this product is macOS-only anyway). Call once,
 * early in main startup, before anything spawns a child process.
 */
export function fixMainProcessPath(): void {
  if (process.platform !== 'darwin') {
    return
  }
  process.env['PATH'] = buildFixedPath(process.env['PATH'] ?? '', readLoginShellPath())
}
