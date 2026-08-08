import { beforeEach, describe, expect, it } from 'vitest'
import { buildWorkspaceSnapshot } from '@shared/types'
import type { LayoutSnapshot, SurfaceStateEntry, Workspace } from '@shared/types'
// Import the registry from its module directly, like the editor one: the
// surfaces barrel re-exports xterm-backed surfaces, which are browser-only and
// would crash this node test environment. The registry itself pulls no xterm.
import {
  FROZEN_NOTICE,
  MAX_SCROLLBACK_LINES,
  NOTIFY_INTERVAL_MS,
  RECONNECTED_HEADER,
  RESTORED_FOOTER,
  RESTORED_HEADER,
  __resetTerminalScrollbackRegistry,
  captureTerminalStates,
  forgetTerminalState,
  formatFrozenNotice,
  formatReconnectedHeader,
  formatRestoredScrollback,
  isAbnormalPtyExit,
  notifyTerminalChanged,
  registerTerminalState,
  seedTerminalRestore,
  subscribeTerminalChanges,
  takeTerminalRestore,
  trimScrollbackLines
} from '@renderer/surfaces/terminalScrollbackRegistry'

const workspace = (id: string): Workspace =>
  ({ id, name: id, backend: { kind: 'host', cwd: '/tmp' } }) as Workspace

const layout = (id: string): LayoutSnapshot =>
  ({
    version: 1,
    workspaceId: id,
    focusedPaneId: 'P0',
    zoomedPaneId: null,
    areas: [],
    root: { type: 'pane', id: 'P0', activeTabId: null, tabs: [] }
  }) as LayoutSnapshot

beforeEach(() => __resetTerminalScrollbackRegistry())

describe('trimScrollbackLines', () => {
  it('drops the trailing blank rows below the cursor but keeps interior blanks', () => {
    expect(trimScrollbackLines(['$ ls', '', 'a.txt', '', '   ', ''])).toEqual(['$ ls', '', 'a.txt'])
  })

  it('keeps only the most recent `max` lines', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`)
    expect(trimScrollbackLines(lines, 3)).toEqual(['line 7', 'line 8', 'line 9'])
  })

  it('is a no-op below the cap and empties out for a blank or zero-cap buffer', () => {
    expect(trimScrollbackLines(['one', 'two'], 5)).toEqual(['one', 'two'])
    expect(trimScrollbackLines(['', '  ', ''])).toEqual([])
    expect(trimScrollbackLines(['one'], 0)).toEqual([])
  })

  it('defaults to the module cap', () => {
    const lines = Array.from({ length: MAX_SCROLLBACK_LINES + 25 }, (_, i) => `l${i}`)
    const trimmed = trimScrollbackLines(lines)
    expect(trimmed).toHaveLength(MAX_SCROLLBACK_LINES)
    expect(trimmed[trimmed.length - 1]).toBe(`l${MAX_SCROLLBACK_LINES + 24}`)
  })
})

describe('formatRestoredScrollback', () => {
  it('wraps the history in dim header/footer markers', () => {
    const payload = formatRestoredScrollback(['$ npm test', 'ok'])
    expect(payload).toBe(
      `\x1b[2m${RESTORED_HEADER}\x1b[0m\r\n$ npm test\r\nok\r\n\x1b[2m${RESTORED_FOOTER}\x1b[0m\r\n`
    )
  })

  it('writes nothing when there is no history to replay', () => {
    expect(formatRestoredScrollback([])).toBe('')
  })
})

describe('terminalScrollbackRegistry — capture', () => {
  it('captures only the given workspace’s registered terminals', () => {
    registerTerminalState('ws-a', 't1', () => ({ lines: ['$ one'] }))
    registerTerminalState('ws-a', 't2', () => ({ lines: ['$ two'] }))
    registerTerminalState('ws-b', 't3', () => ({ lines: ['$ other'] }))

    const captured = captureTerminalStates('ws-a').sort((a, b) => a.tabId.localeCompare(b.tabId))
    expect(captured).toEqual([
      { tabId: 't1', surface: 'terminal', content: { lines: ['$ one'] } },
      { tabId: 't2', surface: 'terminal', content: { lines: ['$ two'] } }
    ])
    expect(captureTerminalStates('ws-b')).toHaveLength(1)
  })

  it('skips a getter that throws rather than failing the whole persist', () => {
    registerTerminalState('ws-a', 'good', () => ({ lines: ['ok'] }))
    registerTerminalState('ws-a', 'bad', () => {
      throw new Error('disposed')
    })
    expect(captureTerminalStates('ws-a')).toEqual([
      { tabId: 'good', surface: 'terminal', content: { lines: ['ok'] } }
    ])
  })

  it('omits an empty terminal — there is nothing to restore from it', () => {
    registerTerminalState('ws-a', 'fresh', () => ({ lines: ['', '   '] }))
    expect(captureTerminalStates('ws-a')).toEqual([])
  })

  it('caps a long-lived terminal at the persisted line budget', () => {
    const lines = Array.from({ length: MAX_SCROLLBACK_LINES + 50 }, (_, i) => `l${i}`)
    registerTerminalState('ws-a', 't1', () => ({ lines }))
    const [entry] = captureTerminalStates('ws-a')
    expect((entry!.content as { lines: string[] }).lines).toHaveLength(MAX_SCROLLBACK_LINES)
  })

  it('forgetTerminalState drops a getter', () => {
    registerTerminalState('ws-a', 't1', () => ({ lines: ['x'] }))
    forgetTerminalState('ws-a', 't1')
    expect(captureTerminalStates('ws-a')).toEqual([])
  })
})

describe('terminalScrollbackRegistry — capture → persist → restore round-trip (AC4.3)', () => {
  it('survives a snapshot write/read and comes back on the right tab', () => {
    registerTerminalState('ws-a', 't1', () => ({ lines: ['$ npm test', '244 passed'] }))
    const captured = captureTerminalStates('ws-a')

    const snapshot = buildWorkspaceSnapshot(workspace('ws-a'), layout('ws-a'), 1234, captured)
    const onDisk = JSON.parse(JSON.stringify(snapshot)).surfaces as SurfaceStateEntry[]

    seedTerminalRestore('ws-a', onDisk)
    expect(takeTerminalRestore('ws-a', 't1')).toEqual({ lines: ['$ npm test', '244 passed'] })
    expect(takeTerminalRestore('ws-a', 'nope')).toBeNull()
    expect(takeTerminalRestore('ws-other', 't1')).toBeNull()
  })

  it('carries terminals and editors in the same `surfaces` list without crosstalk', () => {
    seedTerminalRestore('ws-a', [
      { tabId: 'term', surface: 'terminal', content: { lines: ['$ ok'] } },
      { tabId: 'edit', surface: 'editor', content: { text: 'const x = 1', anchor: 0, head: 0 } }
    ])
    expect(takeTerminalRestore('ws-a', 'term')).toEqual({ lines: ['$ ok'] })
    expect(takeTerminalRestore('ws-a', 'edit')).toBeNull()
  })

  it('consumes the payload so a double mount cannot replay the history twice', () => {
    seedTerminalRestore('ws-a', [
      { tabId: 't1', surface: 'terminal', content: { lines: ['$ ok'] } }
    ])
    expect(takeTerminalRestore('ws-a', 't1')).not.toBeNull()
    expect(takeTerminalRestore('ws-a', 't1')).toBeNull()
  })

  it('ignores malformed or empty payloads instead of throwing', () => {
    seedTerminalRestore('ws-a', [
      { tabId: 'bad', surface: 'terminal', content: null },
      { tabId: 'bad2', surface: 'terminal', content: { lines: 'not-an-array' } },
      { tabId: 'bad3', surface: 'terminal', content: { lines: [] } },
      { tabId: 'mixed', surface: 'terminal', content: { lines: ['keep', 42, null] } },
      { tabId: 'ok', surface: 'terminal', content: { lines: ['$ kept'] } }
    ] as unknown as SurfaceStateEntry[])
    expect(takeTerminalRestore('ws-a', 'bad')).toBeNull()
    expect(takeTerminalRestore('ws-a', 'bad2')).toBeNull()
    expect(takeTerminalRestore('ws-a', 'bad3')).toBeNull()
    expect(takeTerminalRestore('ws-a', 'mixed')).toEqual({ lines: ['keep'] })
    expect(takeTerminalRestore('ws-a', 'ok')).toEqual({ lines: ['$ kept'] })
  })
})

describe('terminalScrollbackRegistry — throttled change notification', () => {
  it('notifies once per interval so an output firehose cannot starve the debounce', () => {
    let calls = 0
    subscribeTerminalChanges('ws-a', () => {
      calls += 1
    })

    expect(notifyTerminalChanged('ws-a', 0)).toBe(true)
    expect(notifyTerminalChanged('ws-a', 1)).toBe(false)
    expect(notifyTerminalChanged('ws-a', NOTIFY_INTERVAL_MS - 1)).toBe(false)
    expect(calls).toBe(1)

    expect(notifyTerminalChanged('ws-a', NOTIFY_INTERVAL_MS)).toBe(true)
    expect(calls).toBe(2)
  })

  it('notifies only the given workspace’s listeners', () => {
    let a = 0
    let b = 0
    subscribeTerminalChanges('ws-a', () => {
      a += 1
    })
    subscribeTerminalChanges('ws-b', () => {
      b += 1
    })
    notifyTerminalChanged('ws-a', 0)
    expect([a, b]).toEqual([1, 0])
  })

  it('stops notifying after unsubscribe, and a workspace with no listeners is a no-op', () => {
    let calls = 0
    const unsubscribe = subscribeTerminalChanges('ws-a', () => {
      calls += 1
    })
    notifyTerminalChanged('ws-a', 0)
    unsubscribe()
    notifyTerminalChanged('ws-a', NOTIFY_INTERVAL_MS)
    expect(calls).toBe(1)
    expect(notifyTerminalChanged('ws-none', 0)).toBe(false)
  })
})

describe('isAbnormalPtyExit — freeze vs close the tab (AC4.3)', () => {
  it('treats a clean exit as normal so the tab still closes with its shell', () => {
    expect(isAbnormalPtyExit({ code: 0 })).toBe(false)
    expect(isAbnormalPtyExit({ code: 0, signal: undefined })).toBe(false)
  })

  it('treats a signalled exit as abnormal even though the code is 0', () => {
    // A force-killed backend — exactly AC4.3's verification method — reports
    // exit code 0 plus a signal on unix, so the code alone would misread it.
    expect(isAbnormalPtyExit({ code: 0, signal: 9 })).toBe(true)
    expect(isAbnormalPtyExit({ code: 0, signal: 15 })).toBe(true)
  })

  it('treats a non-zero or missing code as abnormal', () => {
    expect(isAbnormalPtyExit({ code: 1 })).toBe(true)
    expect(isAbnormalPtyExit({ code: 137 })).toBe(true)
    expect(isAbnormalPtyExit({ code: null })).toBe(true)
  })

  it('ignores a zero signal, which means "not signalled"', () => {
    expect(isAbnormalPtyExit({ code: 0, signal: 0 })).toBe(false)
    expect(isAbnormalPtyExit({ code: 2, signal: 0 })).toBe(true)
  })
})

describe('frozen + reconnect payloads', () => {
  it('writes the freeze notice on its own lines, dimmed', () => {
    const payload = formatFrozenNotice()
    expect(payload).toBe(`\r\n\x1b[2m${FROZEN_NOTICE}\x1b[0m\r\n`)
    expect(payload).toContain('입력 불가')
  })

  it('writes a reconnect divider so the preserved screen above reads as history', () => {
    const payload = formatReconnectedHeader()
    expect(payload).toBe(`\x1b[2m${RECONNECTED_HEADER}\x1b[0m\r\n`)
    // Same dim idiom as the restart-path header/footer.
    expect(payload.startsWith('\x1b[2m')).toBe(true)
    expect(payload.endsWith('\x1b[0m\r\n')).toBe(true)
  })
})

describe('a frozen terminal stays capturable (AC4.3 → AC4.5)', () => {
  it('keeps persisting its preserved screen while the tab stays open', () => {
    // Freezing only drops the PTY, not the content getter: the tab is still
    // mounted, so the autosave must keep snapshotting the preserved screen.
    let lines = ['$ npm test', '  ✓ 12 passed']
    registerTerminalState('ws-a', 'T1', () => ({ lines }))

    expect(captureTerminalStates('ws-a')).toEqual([
      { tabId: 'T1', surface: 'terminal', content: { lines } }
    ])

    lines = [...lines, FROZEN_NOTICE]
    expect(captureTerminalStates('ws-a')).toEqual([
      { tabId: 'T1', surface: 'terminal', content: { lines } }
    ])

    // Only unmounting the tab stops the capture.
    forgetTerminalState('ws-a', 'T1')
    expect(captureTerminalStates('ws-a')).toEqual([])
  })
})
