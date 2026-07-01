import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContainerFileBrowserView } from '@renderer/surfaces/ContainerFileBrowser'
import type { ContainerFileBrowserViewProps } from '@renderer/surfaces/ContainerFileBrowser'
import { joinContainerPath, parentContainerPath } from '@renderer/surfaces/containerPath'

/**
 * Contract checks for the container directory browser (M-J2-S3, AC2.3). The
 * view is pure (props in, markup out), so we render it with react-dom/server
 * and assert the structure the M-J2-S3 e2e drives by: the path header, one
 * testid'd row per entry (directories marked + sorted first), the `../`
 * affordance, and the Save-As filename bar. Navigation math lives in the
 * exported POSIX path helpers, asserted directly.
 */

const noop = () => {}

function render(overrides: Partial<ContainerFileBrowserViewProps>): string {
  const props: ContainerFileBrowserViewProps = {
    mode: 'open',
    path: '/',
    entries: [],
    error: null,
    filename: '',
    onEnterDir: noop,
    onUp: noop,
    onPickFile: noop,
    onFilenameChange: noop,
    onSave: noop,
    onCancel: noop,
    ...overrides
  }
  return renderToStaticMarkup(createElement(ContainerFileBrowserView, props))
}

describe('container path helpers', () => {
  it('joins entry names onto POSIX directories (root included)', () => {
    expect(joinContainerPath('/', 'tmp')).toBe('/tmp')
    expect(joinContainerPath('/tmp', 'e2e')).toBe('/tmp/e2e')
    expect(joinContainerPath('/srv/app', 'note.txt')).toBe('/srv/app/note.txt')
  })

  it('walks up one level, pinning the root to itself', () => {
    expect(parentContainerPath('/srv/app')).toBe('/srv')
    expect(parentContainerPath('/srv')).toBe('/')
    expect(parentContainerPath('/')).toBe('/')
    expect(parentContainerPath('/srv/app/note.txt')).toBe('/srv/app')
  })
})

describe('ContainerFileBrowserView', () => {
  it('renders the current path and one testid’d row per entry, directories first', () => {
    const html = render({
      path: '/work',
      entries: [
        { name: 'readme.md', isDir: false },
        { name: 'src', isDir: true }
      ]
    })

    expect(html).toContain('data-testid="container-file-browser"')
    expect(html).toContain('data-testid="cfb-path"')
    expect(html).toContain('/work')
    expect(html).toContain('data-testid="cfb-entry-src"')
    expect(html).toContain('data-testid="cfb-entry-readme.md"')

    // Directories are marked (trailing slash + dir class) and sorted first.
    expect(html).toContain('src/')
    expect(html.indexOf('cfb-entry-src')).toBeLessThan(html.indexOf('cfb-entry-readme.md'))
    expect(html).toContain('class="cfb-row dir"')
  })

  it('offers ../ except at the root', () => {
    expect(render({ path: '/srv/app' })).toContain('data-testid="cfb-up"')
    expect(render({ path: '/' })).not.toContain('data-testid="cfb-up"')
  })

  it('shows the Save-As filename bar only in save mode', () => {
    const save = render({ mode: 'save', filename: 'note.txt' })
    expect(save).toContain('data-testid="cfb-filename"')
    expect(save).toContain('data-testid="cfb-save"')
    expect(save).toContain('note.txt')

    const open = render({ mode: 'open' })
    expect(open).not.toContain('data-testid="cfb-filename"')
    expect(open).not.toContain('data-testid="cfb-save"')
  })

  it('disables save until a filename is present', () => {
    expect(render({ mode: 'save', filename: '' })).toMatch(/data-testid="cfb-save" disabled/)
    expect(render({ mode: 'save', filename: 'a.ts' })).not.toMatch(
      /data-testid="cfb-save" disabled/
    )
  })

  it('surfaces a listing failure and keeps stale rows hidden', () => {
    const html = render({ path: '/gone', entries: null, error: 'exit 1' })
    expect(html).toContain('data-testid="cfb-error"')
    expect(html).toContain('exit 1')
    expect(html).not.toContain('data-testid="cfb-entry-')
  })
})
