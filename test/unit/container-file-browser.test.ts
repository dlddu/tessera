import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContainerFileBrowserView } from '@renderer/surfaces/ContainerFileBrowser'
import type { ContainerFileBrowserViewProps } from '@renderer/surfaces/ContainerFileBrowser'
import {
  joinContainerPath,
  parentContainerPath,
  sortEntries
} from '@renderer/surfaces/containerPath'

/**
 * Contract checks for the container directory browser (M-J2-S3, AC2.3). The
 * view is pure (props in, markup out), so we render it with react-dom/server
 * and assert the structure the M-J2-S3 e2e drives by: the editable path field,
 * one testid'd row per entry (directories marked), the `../` affordance, the
 * keyboard cursor row, and the Save-As filename bar. Ordering and navigation
 * math live in the exported helpers, asserted directly.
 */

const noop = () => {}

function render(overrides: Partial<ContainerFileBrowserViewProps>): string {
  const props: ContainerFileBrowserViewProps = {
    mode: 'open',
    path: '/',
    pathDraft: '/',
    entries: [],
    error: null,
    filename: '',
    selectedIndex: 0,
    onPathDraftChange: noop,
    onPathSubmit: noop,
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

  it('sorts directories first, each group alphabetical', () => {
    expect(
      sortEntries([
        { name: 'readme.md', isDir: false },
        { name: 'src', isDir: true },
        { name: 'a.ts', isDir: false },
        { name: 'docs', isDir: true }
      ])
    ).toEqual([
      { name: 'docs', isDir: true },
      { name: 'src', isDir: true },
      { name: 'a.ts', isDir: false },
      { name: 'readme.md', isDir: false }
    ])
  })
})

describe('ContainerFileBrowserView', () => {
  it('renders an editable path field and one testid’d row per entry', () => {
    const html = render({
      path: '/work',
      pathDraft: '/work',
      entries: [
        { name: 'src', isDir: true },
        { name: 'readme.md', isDir: false }
      ]
    })

    expect(html).toContain('data-testid="container-file-browser"')
    // The path is an input (typable jump target), prefilled with the cwd.
    expect(html).toMatch(/data-testid="cfb-path"[^>]*value="\/work"/)
    expect(html).toContain('data-testid="cfb-entry-src"')
    expect(html).toContain('data-testid="cfb-entry-readme.md"')

    // Directories are marked with a trailing slash + the dir class.
    expect(html).toContain('src/')
    expect(html).toContain('class="cfb-row dir')
  })

  it('offers ../ except at the root', () => {
    expect(render({ path: '/srv/app', pathDraft: '/srv/app' })).toContain('data-testid="cfb-up"')
    expect(render({ path: '/', pathDraft: '/' })).not.toContain('data-testid="cfb-up"')
  })

  it('marks exactly the keyboard-selected row', () => {
    const entries = [
      { name: 'src', isDir: true },
      { name: 'readme.md', isDir: false }
    ]
    // Index 0 is ../ (path below root); index 2 is the second entry.
    const html = render({ path: '/work', pathDraft: '/work', entries, selectedIndex: 2 })

    expect(html.match(/ selected"/g) ?? []).toHaveLength(1)
    expect(html).toMatch(/class="cfb-row selected"[^>]*data-testid="cfb-entry-readme.md"/)
  })

  it('shows the Save-As filename bar only in save mode, with key hints otherwise', () => {
    const save = render({ mode: 'save', filename: 'note.txt' })
    expect(save).toContain('data-testid="cfb-filename"')
    expect(save).toContain('data-testid="cfb-save"')
    expect(save).toContain('note.txt')

    const open = render({ mode: 'open' })
    expect(open).not.toContain('data-testid="cfb-filename"')
    expect(open).not.toContain('data-testid="cfb-save"')
    expect(open).toContain('cfb-keys')
  })

  it('disables save until a filename is present', () => {
    expect(render({ mode: 'save', filename: '' })).toMatch(/data-testid="cfb-save" disabled/)
    expect(render({ mode: 'save', filename: 'a.ts' })).not.toMatch(
      /data-testid="cfb-save" disabled/
    )
  })

  it('surfaces a listing failure and keeps stale rows hidden', () => {
    const html = render({ path: '/gone', pathDraft: '/gone', entries: null, error: 'exit 1' })
    expect(html).toContain('data-testid="cfb-error"')
    expect(html).toContain('exit 1')
    expect(html).not.toContain('data-testid="cfb-entry-')
  })
})
