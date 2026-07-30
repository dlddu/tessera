import { beforeEach, describe, expect, it } from 'vitest'
import { buildWorkspaceSnapshot } from '@shared/types'
import type { LayoutSnapshot, SurfaceStateEntry, Workspace } from '@shared/types'
// Import the registry from its module directly: the surfaces barrel re-exports
// the CodeMirror-backed EditorSurface, which is browser-only and would crash
// this node test environment. The registry itself pulls no CodeMirror.
import {
  __resetEditorStateRegistry,
  captureEditorStates,
  clampOffset,
  forgetEditorState,
  notifyEditorChanged,
  registerEditorState,
  seedEditorRestore,
  subscribeEditorChanges,
  takeEditorRestore
} from '@renderer/surfaces/editorStateRegistry'

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

beforeEach(() => __resetEditorStateRegistry())

describe('clampOffset', () => {
  it('keeps an in-bounds offset, flooring fractionals', () => {
    expect(clampOffset(3, 10)).toBe(3)
    expect(clampOffset(3.9, 10)).toBe(3)
  })

  it('clamps below 0 and above the length, and treats non-finite as 0', () => {
    expect(clampOffset(-5, 10)).toBe(0)
    expect(clampOffset(99, 10)).toBe(10)
    expect(clampOffset(Number.NaN, 10)).toBe(0)
  })
})

describe('editorStateRegistry — capture', () => {
  it('captures only the given workspace’s registered editors', () => {
    registerEditorState('ws-a', 't1', () => ({ text: 'one', anchor: 1, head: 1 }))
    registerEditorState('ws-a', 't2', () => ({ text: 'two', anchor: 0, head: 3 }))
    registerEditorState('ws-b', 't3', () => ({ text: 'other', anchor: 0, head: 0 }))

    const captured = captureEditorStates('ws-a').sort((a, b) => a.tabId.localeCompare(b.tabId))
    expect(captured).toEqual([
      { tabId: 't1', surface: 'editor', content: { text: 'one', anchor: 1, head: 1 } },
      { tabId: 't2', surface: 'editor', content: { text: 'two', anchor: 0, head: 3 } }
    ])
    expect(captureEditorStates('ws-b')).toHaveLength(1)
  })

  it('skips a getter that throws rather than failing the whole capture', () => {
    registerEditorState('ws-a', 'good', () => ({ text: 'ok', anchor: 0, head: 0 }))
    registerEditorState('ws-a', 'bad', () => {
      throw new Error('view gone')
    })
    expect(captureEditorStates('ws-a')).toEqual([
      { tabId: 'good', surface: 'editor', content: { text: 'ok', anchor: 0, head: 0 } }
    ])
  })

  it('forgetEditorState drops a getter', () => {
    registerEditorState('ws-a', 't1', () => ({ text: 'x', anchor: 0, head: 0 }))
    forgetEditorState('ws-a', 't1')
    expect(captureEditorStates('ws-a')).toEqual([])
  })
})

describe('editorStateRegistry — capture → persist → restore round-trip (AC4.1)', () => {
  it('a captured buffer + cursor survives a JSON round-trip and is restored by tab', () => {
    registerEditorState('ws-a', 't1', () => ({ text: 'const x = 42', anchor: 6, head: 11 }))
    const captured = captureEditorStates('ws-a')

    // Simulate the persist → disk → boot path.
    const onDisk = JSON.parse(JSON.stringify(captured)) as SurfaceStateEntry[]
    __resetEditorStateRegistry()
    seedEditorRestore('ws-a', onDisk)

    expect(takeEditorRestore('ws-a', 't1')).toEqual({ text: 'const x = 42', anchor: 6, head: 11 })
    expect(takeEditorRestore('ws-a', 'nope')).toBeNull()
    expect(takeEditorRestore('ws-other', 't1')).toBeNull()
  })

  it('take peeks (does not consume) so a StrictMode double mount still restores', () => {
    seedEditorRestore('ws-a', [
      { tabId: 't1', surface: 'editor', content: { text: 'hi', anchor: 0, head: 0 } }
    ])
    expect(takeEditorRestore('ws-a', 't1')).not.toBeNull()
    expect(takeEditorRestore('ws-a', 't1')).not.toBeNull()
  })

  it('ignores non-editor surfaces and malformed payloads when seeding', () => {
    seedEditorRestore('ws-a', [
      { tabId: 'term', surface: 'terminal', content: { text: 'x' } },
      { tabId: 'bad', surface: 'editor', content: null },
      { tabId: 'bad2', surface: 'editor', content: { anchor: 1, head: 2 } }, // no text
      { tabId: 'ok', surface: 'editor', content: { text: 'kept' } } // anchor/head default to 0
    ] as SurfaceStateEntry[])
    expect(takeEditorRestore('ws-a', 'term')).toBeNull()
    expect(takeEditorRestore('ws-a', 'bad')).toBeNull()
    expect(takeEditorRestore('ws-a', 'bad2')).toBeNull()
    expect(takeEditorRestore('ws-a', 'ok')).toEqual({ text: 'kept', anchor: 0, head: 0 })
  })
})

describe('editorStateRegistry — change notification', () => {
  it('notifies a workspace’s subscribers and stops after unsubscribe', () => {
    let hits = 0
    const unsubscribe = subscribeEditorChanges('ws-a', () => {
      hits++
    })
    notifyEditorChanged('ws-a')
    notifyEditorChanged('ws-a')
    expect(hits).toBe(2)
    unsubscribe()
    notifyEditorChanged('ws-a')
    expect(hits).toBe(2)
  })

  it('scopes notifications by workspace', () => {
    let a = 0
    let b = 0
    subscribeEditorChanges('ws-a', () => {
      a++
    })
    subscribeEditorChanges('ws-b', () => {
      b++
    })
    notifyEditorChanged('ws-a')
    expect(a).toBe(1)
    expect(b).toBe(0)
  })

  it('notifying a workspace with no subscribers is a no-op', () => {
    expect(() => notifyEditorChanged('ws-none')).not.toThrow()
  })
})

describe('buildWorkspaceSnapshot — surfaces', () => {
  it('defaults surfaces to an empty list when omitted', () => {
    const snap = buildWorkspaceSnapshot(workspace('ws-a'), layout('ws-a'), 100)
    expect(snap.surfaces).toEqual([])
  })

  it('carries the given surface entries through unchanged', () => {
    const surfaces: SurfaceStateEntry[] = [
      { tabId: 't1', surface: 'editor', content: { text: 'hi', anchor: 0, head: 2 } }
    ]
    const snap = buildWorkspaceSnapshot(workspace('ws-a'), layout('ws-a'), 100, surfaces)
    expect(snap.surfaces).toEqual(surfaces)
    expect(snap.workspaceId).toBe('ws-a')
    expect(snap.savedAt).toBe(100)
  })
})
