import { describe, expect, it } from 'vitest'
import { buildFixedPath } from '@main/env/fixPath'

/**
 * The login-shell PATH fix (macOS Finder/auto-update launches inherit a stripped
 * PATH, so the `container` CLI isn't found). `buildFixedPath` is the pure merge
 * at its core; the shell probe + platform guard around it are IO.
 */
describe('buildFixedPath', () => {
  it('leads with the login-shell PATH, backfills fallback dirs, keeps the current PATH', () => {
    expect(buildFixedPath('/usr/bin:/bin', '/opt/homebrew/bin:/usr/bin', ['/usr/local/bin'])).toBe(
      '/opt/homebrew/bin:/usr/bin:/usr/local/bin:/bin'
    )
  })

  it('falls back to the fallback dirs + current PATH when the shell probe fails', () => {
    expect(buildFixedPath('/usr/bin:/bin', null, ['/opt/homebrew/bin', '/usr/local/bin'])).toBe(
      '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
    )
  })

  it('de-duplicates while preserving first-seen order', () => {
    expect(buildFixedPath('/usr/bin', '/usr/bin:/opt/homebrew/bin', ['/opt/homebrew/bin'])).toBe(
      '/usr/bin:/opt/homebrew/bin'
    )
  })

  it('treats an empty shell PATH like no probe result', () => {
    expect(buildFixedPath('/usr/bin', '', ['/usr/local/bin'])).toBe('/usr/local/bin:/usr/bin')
  })

  it('drops empty PATH segments', () => {
    expect(buildFixedPath(':/usr/bin:', null, [])).toBe('/usr/bin')
  })
})
