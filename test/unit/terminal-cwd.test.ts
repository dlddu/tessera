import { beforeEach, describe, expect, it } from 'vitest'
// Import the registry module directly, NOT via the surfaces barrel — the barrel
// re-exports TerminalSurface, which pulls xterm (browser-only) and would crash
// this node test environment.
import {
  __resetContainerCwdRegistry,
  forgetContainerTerminal,
  lastFocusedContainerCwd,
  parseOsc7Path,
  recordContainerCwd,
  recordContainerFocus
} from '@renderer/surfaces/terminalCwdRegistry'

/**
 * M-J2-S2: a container terminal reports its live cwd via OSC 7; a new container
 * terminal opens in the most-recently-focused sibling's cwd. These pure tests
 * cover the parser + the in-memory registry that back that behaviour.
 */

describe('parseOsc7Path', () => {
  it('extracts the path from a file://host/path payload, ignoring the host', () => {
    expect(parseOsc7Path('file://myhost/home/user/proj')).toBe('/home/user/proj')
  })

  it('handles an empty host (file:///path)', () => {
    expect(parseOsc7Path('file:///tmp')).toBe('/tmp')
  })

  it('decodes percent-escapes in the path', () => {
    expect(parseOsc7Path('file://h/a%20b/c')).toBe('/a b/c')
  })

  it('returns null for a non-file:// or unparseable payload', () => {
    expect(parseOsc7Path('7;garbage')).toBeNull()
    expect(parseOsc7Path('file://hostnopath')).toBeNull()
    expect(parseOsc7Path('')).toBeNull()
  })
})

describe('container cwd registry', () => {
  beforeEach(() => {
    __resetContainerCwdRegistry()
  })

  it('returns undefined when no container terminal has reported a cwd', () => {
    expect(lastFocusedContainerCwd('ws-1')).toBeUndefined()
    // A focused terminal that hasn't reported a cwd yet still yields nothing.
    recordContainerFocus('ws-1', 'S-a')
    expect(lastFocusedContainerCwd('ws-1')).toBeUndefined()
  })

  it('inherits the most-recently-focused terminal cwd within a workspace', () => {
    recordContainerFocus('ws-1', 'S-a')
    recordContainerCwd('ws-1', 'S-a', '/home/a')
    recordContainerFocus('ws-1', 'S-b')
    recordContainerCwd('ws-1', 'S-b', '/home/b')

    // S-b was focused last → its cwd wins.
    expect(lastFocusedContainerCwd('ws-1')).toBe('/home/b')

    // Re-focusing S-a flips the winner back.
    recordContainerFocus('ws-1', 'S-a')
    expect(lastFocusedContainerCwd('ws-1')).toBe('/home/a')
  })

  it('tracks the latest cwd a terminal reports as it cd-s around', () => {
    recordContainerFocus('ws-1', 'S-a')
    recordContainerCwd('ws-1', 'S-a', '/home/a')
    recordContainerCwd('ws-1', 'S-a', '/tmp')
    expect(lastFocusedContainerCwd('ws-1')).toBe('/tmp')
  })

  it('falls back to a focused-earlier terminal when the latest has no cwd yet', () => {
    recordContainerFocus('ws-1', 'S-a')
    recordContainerCwd('ws-1', 'S-a', '/home/a')
    // S-b is focused most recently but hasn't reported a cwd — fall back to S-a.
    recordContainerFocus('ws-1', 'S-b')
    expect(lastFocusedContainerCwd('ws-1')).toBe('/home/a')
  })

  it('scopes inheritance to the same workspace (machine)', () => {
    recordContainerFocus('ws-1', 'S-a')
    recordContainerCwd('ws-1', 'S-a', '/home/a')
    recordContainerFocus('ws-2', 'S-b')
    recordContainerCwd('ws-2', 'S-b', '/srv/b')

    expect(lastFocusedContainerCwd('ws-1')).toBe('/home/a')
    expect(lastFocusedContainerCwd('ws-2')).toBe('/srv/b')
    expect(lastFocusedContainerCwd('ws-3')).toBeUndefined()
  })

  it('forgets a terminal on teardown so its cwd no longer inherits', () => {
    recordContainerFocus('ws-1', 'S-a')
    recordContainerCwd('ws-1', 'S-a', '/home/a')
    forgetContainerTerminal('S-a')
    expect(lastFocusedContainerCwd('ws-1')).toBeUndefined()
  })
})
