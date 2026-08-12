/**
 * The pure core of the diagnostics logger: levels, line layout, error
 * serialization, rotation threshold, and the renderer console mapping.
 *
 * Deliberately free of Electron and `fs` imports — same reason as
 * `update/periodicCheck.ts` and the `buildFixedPath` split in `env/fixPath.ts`.
 * These are the decisions worth testing; `logger.ts` wraps them in the IO.
 */

/** Ordered by severity so a numeric compare gates on the configured minimum. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

/** Rotate once the active file would pass this size. */
export const MAX_LOG_BYTES = 2 * 1024 * 1024

/** How many rotated files to keep behind the active one (`main.1` … `main.3`). */
export const MAX_LOG_ROTATIONS = 3

/** Structured payload attached to a line. Values must survive `JSON.stringify`. */
export type LogFields = Record<string, unknown>

/** Whether `level` clears the configured `minimum`. */
export function isLevelEnabled(level: LogLevel, minimum: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minimum)
}

/**
 * Read a level name (from `TESSERA_LOG_LEVEL`) case-insensitively, falling back
 * when it's absent or not a real level.
 */
export function parseLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  const candidate = raw?.trim().toLowerCase()
  return LOG_LEVELS.find((level) => level === candidate) ?? fallback
}

/**
 * Render an unknown thrown value as a single line: `name: message` plus the
 * stack and any `cause` chain, newlines flattened so one event stays one
 * greppable line. Non-`Error` throws (strings, rejected plain objects) are
 * common across the IPC boundary and must not degrade to `[object Object]`.
 */
export function serializeError(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ?? `${error.name}: ${error.message}`
    const flattened = stack.replace(/\s*\n\s*/g, ' | ')
    return error.cause === undefined
      ? flattened
      : `${flattened} | caused by: ${serializeError(error.cause)}`
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    // Circular or otherwise unserializable — the tag still beats losing the event.
    return String(error)
  }
}

/**
 * Build one log line: `<iso>  <LEVEL> [<scope>] <message> <json>`, with the
 * trailing JSON omitted when there are no fields. The fixed-width level keeps
 * columns aligned when reading the raw file.
 */
export function formatLine(
  timestamp: Date,
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields
): string {
  const head = `${timestamp.toISOString()}  ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`
  if (fields === undefined || Object.keys(fields).length === 0) {
    return head
  }
  let encoded: string
  try {
    encoded = JSON.stringify(fields)
  } catch {
    encoded = '{"_":"unserializable fields"}'
  }
  return `${head} ${encoded}`
}

/** Whether the active file needs rotating before `incomingBytes` are appended. */
export function shouldRotate(currentBytes: number, incomingBytes: number): boolean {
  return currentBytes > 0 && currentBytes + incomingBytes > MAX_LOG_BYTES
}

/**
 * Chromium reports console levels as 0–3 (verbose, info, warning, error). Map
 * onto our levels; `verbose` folds into `debug` so it's gated off by default in
 * a packaged build. An unrecognised level becomes `info` rather than vanishing.
 */
export function consoleLevelToLogLevel(level: number): LogLevel {
  switch (level) {
    case 0:
      return 'debug'
    case 2:
      return 'warn'
    case 3:
      return 'error'
    default:
      return 'info'
  }
}

/**
 * Trim a renderer source URL to something readable. Bundled renderer sources are
 * `file:///…/out/renderer/assets/index-a1b2c3.js`, and the leading path is
 * identical on every line.
 */
export function shortenSource(sourceId: string): string {
  if (sourceId === '') {
    return '<unknown>'
  }
  const lastSlash = sourceId.lastIndexOf('/')
  return lastSlash === -1 ? sourceId : sourceId.slice(lastSlash + 1)
}

/** The fields of Electron's `before-input-event` input this module reasons about. */
export interface ChordInput {
  type: string
  /** `KeyboardEvent.code` — the physical key, e.g. `KeyL`. */
  code: string
  alt: boolean
  meta: boolean
}

/**
 * Whether an input event is the reveal-logs chord (`Cmd+Alt+L`).
 *
 * Matches on `code`, never `key`. On macOS the Option key acts as a compose
 * modifier, so `KeyboardEvent.key` for Option+L is `¬` — not `l`. A `key === 'l'`
 * comparison is therefore never true on the very platform this app ships to,
 * which is exactly the bug this function exists to prevent regressing.
 */
export function isRevealLogsChord(input: ChordInput): boolean {
  return input.type === 'keyDown' && input.meta && input.alt && input.code === 'KeyL'
}
