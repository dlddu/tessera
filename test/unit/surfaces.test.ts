import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
// Import the two static surfaces from their modules directly: the surfaces
// barrel re-exports Terminal/Editor surfaces, which pull xterm/CodeMirror
// (browser-only) and would crash this node test environment.
import { BrowserSurface } from '@renderer/surfaces/BrowserSurface'
import { ClaudeSurface } from '@renderer/surfaces/ClaudeSurface'

// M-J1-S4: the browser + Claude panes are static visual surfaces. They have no
// native/IPC dependencies, so we can render them to static markup and assert
// they reproduce the mockup's identity classes + testids.

describe('BrowserSurface', () => {
  const html = renderToStaticMarkup(createElement(BrowserSurface))

  it('exposes the browser-surface testid on the C-browser root', () => {
    expect(html).toContain('data-testid="browser-surface"')
    expect(html).toContain('class="browser"')
  })

  it('renders the address bar + a skeleton page in web identity', () => {
    expect(html).toContain('class="bchrome"')
    expect(html).toContain('class="baddr"')
    expect(html).toContain('localhost:5173')
    expect(html).toContain('class="bview"')
    expect(html).toContain('class="page-bar"')
    expect(html).toContain('skline')
    // The page logo carries the browser identity hue.
    expect(html).toContain('var(--id-web)')
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
