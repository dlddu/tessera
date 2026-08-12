/**
 * Main-process file logger (platform infrastructure, like `update/`).
 *
 * A packaged macOS app launched from Finder has nowhere to print: stdout/stderr
 * are discarded, DevTools is closed, and the renderer's console is invisible. So
 * anything the app wants to tell us after shipping has to land on disk. This
 * module is that landing spot — the main process, and the renderer via the
 * `console-message` relay in `attachWindowDiagnostics`, both write here.
 *
 * Location: `app.getPath('logs')` → `~/Library/Logs/tessera/main.log` on macOS.
 * Tail it with `npm run logs`.
 *
 * Writes are **synchronous**. Volume is low by design (lifecycle events and
 * failures, never PTY traffic), and the lines that matter most are the ones
 * written microseconds before a crash — an async queue would lose exactly those.
 *
 * Rotation is size-based: `main.log` → `main.1.log` → `main.2.log`, oldest
 * dropped. No date rolling; a solo-developer app doesn't need a retention story,
 * it needs the last few megabytes to still be there when something breaks.
 *
 * The decisions live in `logFormat.ts` (Electron-free, unit-tested); this file
 * is the IO around them.
 */
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  MAX_LOG_ROTATIONS,
  formatLine,
  isLevelEnabled,
  shouldRotate,
  type LogFields,
  type LogLevel
} from './logFormat'

const BASENAME = 'main.log'

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** A child logger that tags every line with `scope`, e.g. `[main:backend]`. */
  scope(scope: string): Logger
}

/** Resolved lazily: `app.getPath` needs Electron, and callers run at import time. */
let logDirectory: string | null = null

function resolveLogDirectory(): string {
  if (logDirectory === null) {
    logDirectory = app.getPath('logs')
    mkdirSync(logDirectory, { recursive: true })
  }
  return logDirectory
}

/** The absolute path of the active log file. */
export function logFilePath(): string {
  return join(resolveLogDirectory(), BASENAME)
}

/** The directory holding the active + rotated files. */
export function logDirectoryPath(): string {
  return resolveLogDirectory()
}

/**
 * Shift `main.log` → `main.1.log` → … dropping the oldest. Best-effort: a failed
 * rotation must never take down the app, so the write just continues into the
 * oversized file.
 */
function rotate(directory: string): void {
  try {
    rmSync(join(directory, `main.${MAX_LOG_ROTATIONS}.log`), { force: true })
    for (let index = MAX_LOG_ROTATIONS - 1; index >= 1; index--) {
      try {
        renameSync(join(directory, `main.${index}.log`), join(directory, `main.${index + 1}.log`))
      } catch {
        // That generation doesn't exist yet — nothing to shift.
      }
    }
    renameSync(join(directory, BASENAME), join(directory, 'main.1.log'))
  } catch {
    // Keep writing to the current file rather than losing the line.
  }
}

function currentSize(file: string): number {
  try {
    return statSync(file).size
  } catch {
    return 0 // Not created yet.
  }
}

/**
 * The one place a line reaches disk. Every failure is swallowed *here* and only
 * here: logging must never be the thing that crashes the app, but no other
 * module gets to silently drop an event.
 */
function write(line: string): void {
  try {
    const directory = resolveLogDirectory()
    const file = join(directory, BASENAME)
    if (shouldRotate(currentSize(file), Buffer.byteLength(line))) {
      rotate(directory)
    }
    appendFileSync(file, `${line}\n`, 'utf8')
  } catch {
    // Disk full, permissions, sandbox — nothing useful left to do.
  }
}

let minimumLevel: LogLevel = 'info'

/**
 * Set the floor for what reaches disk. Called once at startup: `debug` while
 * unpackaged, `info` in a packaged build, either overridden by
 * `TESSERA_LOG_LEVEL` so a shipped app can be made chatty without a rebuild.
 */
export function configureLogLevel(level: LogLevel): void {
  minimumLevel = level
}

export function currentLogLevel(): LogLevel {
  return minimumLevel
}

function emit(level: LogLevel, scope: string, message: string, fields?: LogFields): void {
  if (!isLevelEnabled(level, minimumLevel)) {
    return
  }
  const line = formatLine(new Date(), level, scope, message, fields)
  write(line)
  // Unpackaged runs also keep the terminal useful — `npm run dev` shows it live.
  if (!app.isPackaged) {
    process.stdout.write(`${line}\n`)
  }
}

function createLogger(scope: string): Logger {
  return {
    debug: (message, fields) => emit('debug', scope, message, fields),
    info: (message, fields) => emit('info', scope, message, fields),
    warn: (message, fields) => emit('warn', scope, message, fields),
    error: (message, fields) => emit('error', scope, message, fields),
    scope: (child) => createLogger(`${scope}:${child}`)
  }
}

/** Root logger. Prefer `log.scope('backend')` in a module over logging raw. */
export const log: Logger = createLogger('main')
