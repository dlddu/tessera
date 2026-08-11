import { describe, expect, it } from 'vitest'
import {
  consoleLevelToLogLevel,
  formatLine,
  isLevelEnabled,
  parseLevel,
  serializeError,
  shortenSource,
  shouldRotate
} from '@main/diagnostics/logFormat'

/**
 * The file logger's pure core. The transport around it (append, rotate, resolve
 * `app.getPath`) is IO and needs Electron; these are the decisions it makes.
 */
describe('isLevelEnabled', () => {
  it('passes levels at or above the minimum', () => {
    expect(isLevelEnabled('warn', 'info')).toBe(true)
    expect(isLevelEnabled('info', 'info')).toBe(true)
  })

  it('gates levels below the minimum', () => {
    expect(isLevelEnabled('debug', 'info')).toBe(false)
    expect(isLevelEnabled('info', 'error')).toBe(false)
  })
})

describe('parseLevel', () => {
  it('accepts a level name case-insensitively', () => {
    expect(parseLevel('WARN', 'info')).toBe('warn')
    expect(parseLevel('  debug ', 'info')).toBe('debug')
  })

  it('falls back when unset or not a level', () => {
    expect(parseLevel(undefined, 'info')).toBe('info')
    expect(parseLevel('chatty', 'error')).toBe('error')
    expect(parseLevel('', 'debug')).toBe('debug')
  })
})

describe('serializeError', () => {
  it('flattens an Error stack onto one greppable line', () => {
    const error = new Error('spawn failed')
    const line = serializeError(error)
    expect(line).toContain('spawn failed')
    expect(line).not.toContain('\n')
  })

  it('follows the cause chain', () => {
    const line = serializeError(new Error('outer', { cause: new Error('ENOENT: container') }))
    expect(line).toContain('outer')
    expect(line).toContain('caused by:')
    expect(line).toContain('ENOENT: container')
  })

  it('keeps a thrown string as-is', () => {
    expect(serializeError('not implemented')).toBe('not implemented')
  })

  it('encodes a non-Error object rather than stringifying to [object Object]', () => {
    expect(serializeError({ code: 'EPIPE' })).toBe('{"code":"EPIPE"}')
  })

  it('survives a circular value', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    expect(() => serializeError(circular)).not.toThrow()
  })
})

describe('formatLine', () => {
  const at = new Date('2026-08-08T12:03:11.482Z')

  it('lays out timestamp, padded level, scope, and message', () => {
    expect(formatLine(at, 'info', 'boot', 'app starting')).toBe(
      '2026-08-08T12:03:11.482Z  INFO  [boot] app starting'
    )
  })

  it('appends fields as JSON', () => {
    expect(formatLine(at, 'warn', 'restore', 'backend restore failed', { workspaceId: 'w1' })).toBe(
      '2026-08-08T12:03:11.482Z  WARN  [restore] backend restore failed {"workspaceId":"w1"}'
    )
  })

  it('omits the JSON entirely when there are no fields', () => {
    expect(formatLine(at, 'error', 'main', 'boom', {})).not.toContain('{')
  })

  it('degrades to a tag rather than throwing on unserializable fields', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    expect(formatLine(at, 'error', 'main', 'boom', circular)).toContain('unserializable')
  })
})

describe('shouldRotate', () => {
  it('rotates once the incoming line would push past the cap', () => {
    expect(shouldRotate(2 * 1024 * 1024, 1)).toBe(true)
  })

  it('leaves a file below the cap alone', () => {
    expect(shouldRotate(1024, 128)).toBe(false)
  })

  it('never rotates an empty file, however large the line', () => {
    expect(shouldRotate(0, 10 * 1024 * 1024)).toBe(false)
  })
})

/**
 * The renderer console relay: a packaged build has no DevTools, so Chromium's
 * numeric console levels have to survive the trip into the log file.
 */
describe('consoleLevelToLogLevel', () => {
  it('maps Chromium 0-3 onto our levels, folding verbose into debug', () => {
    expect(consoleLevelToLogLevel(0)).toBe('debug')
    expect(consoleLevelToLogLevel(1)).toBe('info')
    expect(consoleLevelToLogLevel(2)).toBe('warn')
    expect(consoleLevelToLogLevel(3)).toBe('error')
  })

  it('treats an unknown level as info rather than dropping the message', () => {
    expect(consoleLevelToLogLevel(99)).toBe('info')
  })
})

describe('shortenSource', () => {
  it('keeps only the filename of a bundled renderer source', () => {
    expect(shortenSource('file:///Applications/Tessera.app/out/renderer/index-a1b2.js')).toBe(
      'index-a1b2.js'
    )
  })

  it('passes through a bare source id', () => {
    expect(shortenSource('TerminalSurface.tsx')).toBe('TerminalSurface.tsx')
  })

  it('labels a missing source', () => {
    expect(shortenSource('')).toBe('<unknown>')
  })
})
