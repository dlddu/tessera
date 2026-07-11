import { describe, expect, it, vi } from 'vitest'
import {
  COMMANDS,
  LAYOUT_COMMANDS,
  WORKSPACE_COMMANDS,
  commandById,
  dispatchKey,
  filterCommands,
  workspaceContext,
  type CommandContext
} from '@renderer/commands'

/**
 * The shared command registry (J2-S5, AC2.5) — the single source the layout
 * keymap, the App-level workspace keys, the ⌘K palette, and the key-hint
 * surfaces all read. These tests pin the two behaviours that must never drift:
 *   - `match` recognises exactly the intended physical chord (so the migrated
 *     keymap dispatches the same keys the old inline branches did), and
 *   - `run` performs the intended effect however it's reached (keymap with the
 *     event, palette without) — the property that makes a shortcut and its
 *     palette twin identical, and thus host/container parity structural.
 */

/** Build a synthetic keyboard event (node env has no `KeyboardEvent`). */
function kbd(o: {
  meta?: boolean
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  key?: string
  code?: string
}): KeyboardEvent {
  return {
    metaKey: o.meta ?? false,
    ctrlKey: o.ctrl ?? false,
    altKey: o.alt ?? false,
    shiftKey: o.shift ?? false,
    key: o.key ?? '',
    code: o.code ?? '',
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as KeyboardEvent
}

/** A context whose every effect is a spy, with a focused pane by default. */
function mockCtx(focusedPaneId: string | null = 'P0') {
  const layout = {
    splitVertical: vi.fn(),
    splitHorizontal: vi.fn(),
    addTab: vi.fn(),
    activateTab: vi.fn(),
    closeTab: vi.fn(),
    moveTab: vi.fn(),
    focusPane: vi.fn(),
    focusDirection: vi.fn(),
    setTabPath: vi.fn(),
    setTabUrl: vi.fn(),
    setTabTitle: vi.fn(),
    cycleTab: vi.fn(),
    moveActiveTabToDirection: vi.fn(),
    closeActiveTab: vi.fn(),
    toggleZoom: vi.fn(),
    clearZoom: vi.fn()
  }
  const setPending = vi.fn()
  const toggleKeymap = vi.fn()
  const workspace = {
    create: vi.fn(),
    close: vi.fn(),
    switchTo: vi.fn(),
    switchNext: vi.fn()
  }
  const hostArea = { open: vi.fn(), close: vi.fn() }
  const ctx: CommandContext = {
    layout,
    setPending,
    focusedPaneId,
    toggleKeymap,
    workspace,
    hostArea
  }
  return { ctx, layout, setPending, toggleKeymap, workspace, hostArea }
}

describe('registry shape', () => {
  it('splits into layout + workspace groups covering every command', () => {
    expect(LAYOUT_COMMANDS.every((c) => c.scope === 'layout')).toBe(true)
    expect(WORKSPACE_COMMANDS.every((c) => c.scope === 'workspace')).toBe(true)
    expect(LAYOUT_COMMANDS.length + WORKSPACE_COMMANDS.length).toBe(COMMANDS.length)
  })

  it('gives every command a unique id, a label, and keycap glyphs', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of COMMANDS) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.keycap.mods.length).toBeGreaterThan(0)
      expect(c.keycap.keys.length).toBeGreaterThan(0)
    }
  })

  it('commandById resolves a known id and throws on an unknown one', () => {
    expect(commandById('zoom').id).toBe('zoom')
    // @ts-expect-error — exercising the runtime guard with an invalid id.
    expect(() => commandById('nope')).toThrow()
  })
})

describe('match — exact chords', () => {
  it('split-v = ⌘D, split-h = ⇧⌘D (Ctrl excluded so Ctrl+D stays terminal EOF)', () => {
    const v = commandById('split-v')
    const h = commandById('split-h')
    expect(v.match(kbd({ meta: true, key: 'd' }))).toBe(true)
    expect(v.match(kbd({ meta: true, shift: true, key: 'd' }))).toBe(false)
    expect(v.match(kbd({ meta: true, ctrl: true, key: 'd' }))).toBe(false)
    expect(h.match(kbd({ meta: true, shift: true, key: 'd' }))).toBe(true)
    expect(h.match(kbd({ meta: true, key: 'd' }))).toBe(false)
  })

  it('focus = ⌥⌘+arrow, move = ⌃⌘+arrow (they never overlap)', () => {
    const focus = commandById('focus')
    const move = commandById('move')
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      expect(focus.match(kbd({ meta: true, alt: true, key }))).toBe(true)
      expect(focus.match(kbd({ meta: true, ctrl: true, key }))).toBe(false)
      expect(move.match(kbd({ meta: true, ctrl: true, key }))).toBe(true)
      expect(move.match(kbd({ meta: true, alt: true, key }))).toBe(false)
    }
    // A bare ⌘+arrow (neither alt nor ctrl) triggers neither.
    expect(focus.match(kbd({ meta: true, key: 'ArrowRight' }))).toBe(false)
    expect(move.match(kbd({ meta: true, key: 'ArrowRight' }))).toBe(false)
  })

  it('tab-switch = ⇧⌘ brackets (bare or shifted glyphs)', () => {
    const t = commandById('tab-switch')
    for (const key of ['[', ']', '{', '}']) {
      expect(t.match(kbd({ meta: true, shift: true, key }))).toBe(true)
    }
    expect(t.match(kbd({ meta: true, key: ']' }))).toBe(false)
  })

  it('overlay = ⌘⌥/ by physical code (so a remapped ⌥ glyph is irrelevant)', () => {
    const o = commandById('overlay')
    expect(o.match(kbd({ meta: true, alt: true, code: 'Slash', key: '÷' }))).toBe(true)
    expect(o.match(kbd({ meta: true, code: 'Slash', key: '/' }))).toBe(false)
  })

  it('zoom = ⇧⌘⏎, close-tab = ⌘W, close-workspace = ⇧⌘W', () => {
    expect(commandById('zoom').match(kbd({ meta: true, shift: true, key: 'Enter' }))).toBe(true)
    expect(commandById('close-tab').match(kbd({ meta: true, key: 'w' }))).toBe(true)
    expect(commandById('close-tab').match(kbd({ meta: true, shift: true, key: 'w' }))).toBe(false)
    expect(commandById('close-workspace').match(kbd({ meta: true, shift: true, key: 'w' }))).toBe(
      true
    )
  })

  it('open-host-area = ⌃⌘H, close-host-area = ⇧⌃⌘H (shift is the discriminator)', () => {
    const open = commandById('open-host-area')
    const close = commandById('close-host-area')
    // ⌃⌘H opens; the shift-twin ⇧⌃⌘H closes — neither matches the other's chord.
    expect(open.match(kbd({ meta: true, ctrl: true, key: 'h' }))).toBe(true)
    expect(open.match(kbd({ meta: true, ctrl: true, shift: true, key: 'H' }))).toBe(false)
    expect(close.match(kbd({ meta: true, ctrl: true, shift: true, key: 'H' }))).toBe(true)
    expect(close.match(kbd({ meta: true, ctrl: true, key: 'h' }))).toBe(false)
    // ⌥ excluded (⌃⌘H is not an ⌥ chord), and a bare ⌘H doesn't reach either.
    expect(open.match(kbd({ meta: true, ctrl: true, alt: true, key: 'h' }))).toBe(false)
    expect(open.match(kbd({ meta: true, key: 'h' }))).toBe(false)
    // The ⌃⌘+arrow tab-move command never collides with the ⌃⌘H host-area key.
    expect(commandById('move').match(kbd({ meta: true, ctrl: true, key: 'h' }))).toBe(false)
    expect(open.match(kbd({ meta: true, ctrl: true, key: 'ArrowRight' }))).toBe(false)
  })

  it('new-workspace = ⌘/Ctrl+N, switch-workspace = ⌘1–9 only', () => {
    const n = commandById('new-workspace')
    expect(n.match(kbd({ meta: true, key: 'n' }))).toBe(true)
    expect(n.match(kbd({ ctrl: true, key: 'n' }))).toBe(true)
    const s = commandById('switch-workspace')
    expect(s.match(kbd({ meta: true, key: '1' }))).toBe(true)
    expect(s.match(kbd({ meta: true, key: '9' }))).toBe(true)
    expect(s.match(kbd({ meta: true, key: '0' }))).toBe(false)
    expect(s.match(kbd({ meta: true, alt: true, key: '1' }))).toBe(false)
  })
})

describe('run — effects (keymap with event, palette without)', () => {
  it('split/add commands raise a pending pick only when a pane is focused', () => {
    const focused = mockCtx('P0')
    commandById('split-v').run(focused.ctx)
    commandById('add-tab').run(focused.ctx)
    expect(focused.setPending).toHaveBeenCalledWith({ action: 'split-v', paneId: 'P0' })
    expect(focused.setPending).toHaveBeenCalledWith({ action: 'add', paneId: 'P0' })

    const unfocused = mockCtx(null)
    commandById('split-h').run(unfocused.ctx)
    expect(unfocused.setPending).not.toHaveBeenCalled()
  })

  it('focus reads its direction from the event, defaulting to right in the palette', () => {
    const m = mockCtx()
    commandById('focus').run(m.ctx, kbd({ meta: true, alt: true, key: 'ArrowUp' }))
    expect(m.layout.focusDirection).toHaveBeenCalledWith('up')
    commandById('focus').run(m.ctx) // palette: no event
    expect(m.layout.focusDirection).toHaveBeenLastCalledWith('right')
  })

  it('move reads its direction from the event, defaulting to right in the palette', () => {
    const m = mockCtx()
    commandById('move').run(m.ctx, kbd({ meta: true, ctrl: true, key: 'ArrowLeft' }))
    expect(m.layout.moveActiveTabToDirection).toHaveBeenCalledWith('left')
    commandById('move').run(m.ctx)
    expect(m.layout.moveActiveTabToDirection).toHaveBeenLastCalledWith('right')
  })

  it('tab-switch cycles next on ], prev on [, next from the palette', () => {
    const m = mockCtx()
    commandById('tab-switch').run(m.ctx, kbd({ meta: true, shift: true, key: ']' }))
    expect(m.layout.cycleTab).toHaveBeenLastCalledWith('next')
    commandById('tab-switch').run(m.ctx, kbd({ meta: true, shift: true, key: '[' }))
    expect(m.layout.cycleTab).toHaveBeenLastCalledWith('prev')
    commandById('tab-switch').run(m.ctx)
    expect(m.layout.cycleTab).toHaveBeenLastCalledWith('next')
  })

  it('zoom/overlay/close-tab hit their layout + view effects', () => {
    const m = mockCtx()
    commandById('zoom').run(m.ctx)
    commandById('overlay').run(m.ctx)
    commandById('close-tab').run(m.ctx)
    expect(m.layout.toggleZoom).toHaveBeenCalledTimes(1)
    expect(m.toggleKeymap).toHaveBeenCalledTimes(1)
    expect(m.layout.closeActiveTab).toHaveBeenCalledTimes(1)
  })

  it('host-area commands open/close via the hostArea handlers (AC2.7)', () => {
    const m = mockCtx()
    commandById('open-host-area').run(m.ctx)
    commandById('close-host-area').run(m.ctx)
    expect(m.hostArea.open).toHaveBeenCalledTimes(1)
    expect(m.hostArea.close).toHaveBeenCalledTimes(1)
  })

  it('workspace commands switch by index from the event, next from the palette', () => {
    const m = mockCtx()
    commandById('new-workspace').run(m.ctx)
    commandById('close-workspace').run(m.ctx)
    commandById('switch-workspace').run(m.ctx, kbd({ meta: true, key: '3' }))
    commandById('switch-workspace').run(m.ctx) // palette
    expect(m.workspace.create).toHaveBeenCalledTimes(1)
    expect(m.workspace.close).toHaveBeenCalledTimes(1)
    expect(m.workspace.switchTo).toHaveBeenCalledWith(2) // ⌘3 → 0-based index 2
    expect(m.workspace.switchNext).toHaveBeenCalledTimes(1)
  })
})

describe('dispatchKey — routing', () => {
  it('runs the first matching command, consumes the event, and reports handled', () => {
    const m = mockCtx('P0')
    const e = kbd({ meta: true, key: 'd' })
    expect(dispatchKey(e, LAYOUT_COMMANDS, m.ctx)).toBe(true)
    expect(m.setPending).toHaveBeenCalledWith({ action: 'split-v', paneId: 'P0' })
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
    expect(e.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('leaves an unmatched event untouched and reports not-handled', () => {
    const m = mockCtx()
    const e = kbd({ key: 'a' }) // no modifier — matches nothing
    expect(dispatchKey(e, LAYOUT_COMMANDS, m.ctx)).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('workspaceContext runs ⌘N without a layout present', () => {
    const create = vi.fn()
    const ctx = workspaceContext({
      create,
      close: vi.fn(),
      switchTo: vi.fn(),
      switchNext: vi.fn()
    })
    expect(dispatchKey(kbd({ meta: true, key: 'n' }), WORKSPACE_COMMANDS, ctx)).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('filterCommands — palette search', () => {
  it('returns every command for an empty/whitespace query', () => {
    expect(filterCommands(COMMANDS, '')).toHaveLength(COMMANDS.length)
    expect(filterCommands(COMMANDS, '   ')).toHaveLength(COMMANDS.length)
  })

  it('matches a case-insensitive substring of the label', () => {
    const split = filterCommands(COMMANDS, '분할').map((c) => c.id)
    expect(split).toContain('split-v')
    expect(split).toContain('split-h')
    expect(split).not.toContain('zoom')

    const ws = filterCommands(COMMANDS, '워크스페이스').map((c) => c.id)
    expect(ws).toEqual(
      expect.arrayContaining(['new-workspace', 'switch-workspace', 'close-workspace'])
    )
  })

  it('returns nothing when no label matches', () => {
    expect(filterCommands(COMMANDS, 'zzzz-no-match')).toHaveLength(0)
  })
})
