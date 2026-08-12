/**
 * Renderer-side logging that lands in the main process's log file.
 *
 * There is no IPC channel here on purpose: `attachWindowDiagnostics` already
 * relays this window's `console-message` events into `main.log`, so a plain
 * `console.*` call is a durable trace in a packaged build. This module exists
 * only to make those calls *readable on the other side*:
 *
 * - Fields are stringified here. The relay hands Electron a single formatted
 *   message, where a passed object degrades to `[object Object]` — so the JSON
 *   has to be in the string before it leaves the renderer.
 * - The `[scope] message {json}` layout matches `logFormat.formatLine`, so the
 *   relayed lines grep the same way as the main process's own.
 *
 * Level maps through `consoleLevelToLogLevel`: `debug` → `debug` (gated off in
 * a packaged build unless `TESSERA_LOG_LEVEL=debug`), which is the right home
 * for routine per-save traces. Reserve `warn` for state the user will miss.
 */

type Fields = Record<string, unknown>

export interface RendererLog {
  debug(message: string, fields?: Fields): void
  info(message: string, fields?: Fields): void
  warn(message: string, fields?: Fields): void
}

function line(scope: string, message: string, fields?: Fields): string {
  const head = `[${scope}] ${message}`
  if (fields === undefined || Object.keys(fields).length === 0) return head
  try {
    return `${head} ${JSON.stringify(fields)}`
  } catch {
    return `${head} {"_":"unserializable fields"}`
  }
}

/** A logger tagged with `scope`, e.g. `createLog('persist')`. */
export function createLog(scope: string): RendererLog {
  return {
    debug: (message, fields) => console.debug(line(scope, message, fields)),
    info: (message, fields) => console.info(line(scope, message, fields)),
    warn: (message, fields) => console.warn(line(scope, message, fields))
  }
}
