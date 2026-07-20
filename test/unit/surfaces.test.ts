import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TabNode } from '@shared/types'
// Import the surfaces from their modules directly: the surfaces barrel
// re-exports Terminal/Editor surfaces, which pull xterm/CodeMirror (browser-
// only) and would crash this node test environment.
import { BrowserSurface } from '@renderer/surfaces/BrowserSurface'
import { ClaudeSurface } from '@renderer/surfaces/ClaudeSurface'

// The Claude pane is still a static visual surface; the browser pane is now
// live (PRD-3) — its page is a host WebContentsView owned by main, so here we
// render only its chrome (static markup runs no effects, so it never touches
// the IPC bridge) and assert the address bar + nav + view region.

describe('BrowserSurface (live chrome)', () => {
  const tab: TabNode = {
    id: 'tab-web',
    title: 'idp.acme.dev',
    surface: 'browser',
    areaId: 'area-default',
    url: 'https://idp.acme.dev/authorize'
  }
  const html = renderToStaticMarkup(
    createElement(BrowserSurface, { tab, onTitle: () => {}, onUrl: () => {} })
  )

  it('exposes the browser-surface testid on the C-browser root', () => {
    expect(html).toContain('data-testid="browser-surface"')
    expect(html).toContain('class="browser"')
  })

  it('renders an editable address bar seeded with the tab URL, nav buttons, and the view region', () => {
    expect(html).toContain('class="bchrome"')
    expect(html).toContain('class="baddr"')
    // The address bar is a live input pre-filled with the tab's URL (AC3.2).
    expect(html).toContain('urlinput')
    expect(html).toContain('value="https://idp.acme.dev/authorize"')
    // Nav controls are present (back/forward/reload).
    expect(html).toContain('class="navbtn"')
    expect(html).toContain('aria-label="새로고침"')
    // The region the native WebContentsView is positioned over.
    expect(html).toContain('data-testid="browser-view"')
    expect(html).toContain('bview-live')
  })
})

describe('ClaudeSurface', () => {
  const html = renderToStaticMarkup(createElement(ClaudeSurface))

  it('exposes the claude-surface testid on the C-claude root', () => {
    expect(html).toContain('data-testid="claude-surface"')
    expect(html).toContain('class="claude"')
  })

  it('renders a transcript (user + assistant turns) and a composer', () => {
    expect(html).toContain('class="turns"')
    expect(html).toContain('class="turn user"')
    expect(html).toContain('class="turn asst"')
    expect(html).toContain('class="run"')
    expect(html).toContain('class="spinner"')
    expect(html).toContain('class="composer"')
    expect(html).toContain('메시지 입력…')
  })
})
