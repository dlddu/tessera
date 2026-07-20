import { describe, expect, it } from 'vitest'
import { IpcChannels } from '@shared/ipc'
import type { BrowserStateEvent } from '@shared/ipc'
import { BrowserViewRegistry } from '@main/surface/BrowserViewRegistry'
import type { ManagedView, ManagedWebContents, ViewParent } from '@main/surface/BrowserViewRegistry'

/** A controllable stand-in for an Electron WebContents. */
function fakeWebContents() {
  const listeners = new Map<string, Array<() => void>>()
  const nav = { url: '', title: '', loading: false, back: false, forward: false }
  const calls = {
    loads: [] as string[],
    goBack: 0,
    goForward: 0,
    reload: 0,
    stop: 0,
    closed: false
  }
  let destroyed = false
  const wc: ManagedWebContents = {
    async loadURL(url) {
      calls.loads.push(url)
      nav.url = url
    },
    getURL: () => nav.url,
    getTitle: () => nav.title,
    goBack: () => void (calls.goBack += 1),
    goForward: () => void (calls.goForward += 1),
    reload: () => void (calls.reload += 1),
    stop: () => void (calls.stop += 1),
    canGoBack: () => nav.back,
    canGoForward: () => nav.forward,
    isLoading: () => nav.loading,
    isDestroyed: () => destroyed,
    on: (event, listener) => {
      const arr = listeners.get(event) ?? []
      arr.push(listener)
      listeners.set(event, arr)
    },
    // Closing destroys the contents (as in Electron): later events go silent.
    close: () => {
      calls.closed = true
      destroyed = true
    }
  }
  const fire = (event: string): void => (listeners.get(event) ?? []).forEach((l) => l())
  return { wc, nav, calls, fire, destroy: () => void (destroyed = true) }
}

function fakeView(wc: ManagedWebContents) {
  const state = { bounds: null as unknown, visible: null as boolean | null }
  const view: ManagedView = {
    webContents: wc,
    setBounds: (rect) => void (state.bounds = rect),
    setVisible: (visible) => void (state.visible = visible)
  }
  return { view, state }
}

function harness() {
  const added: ManagedView[] = []
  const removed: ManagedView[] = []
  const parent: ViewParent = {
    addChildView: (v) => void added.push(v),
    removeChildView: (v) => void removed.push(v)
  }
  const emitted: Array<{ channel: string; payload: unknown }> = []
  const backers: ReturnType<typeof fakeWebContents>[] = []
  const views: ReturnType<typeof fakeView>[] = []
  const registry = new BrowserViewRegistry(
    parent,
    () => {
      const backer = fakeWebContents()
      backers.push(backer)
      const v = fakeView(backer.wc)
      views.push(v)
      return v.view
    },
    (channel, payload) => emitted.push({ channel, payload })
  )
  return { registry, parent, added, removed, emitted, backers, views }
}

describe('BrowserViewRegistry', () => {
  it('creates a view, parents it hidden, and loads the initial URL', () => {
    const h = harness()
    const viewId = h.registry.create('tab-1', 'https://idp.acme.dev/authorize')

    expect(viewId).toContain('tab-1')
    expect(h.added).toHaveLength(1)
    // Hidden until the renderer sends bounds (no flash at 0,0).
    expect(h.views[0]!.state.visible).toBe(false)
    expect(h.backers[0]!.calls.loads).toEqual(['https://idp.acme.dev/authorize'])
    expect(h.registry.size).toBe(1)
  })

  it('creates a blank view when no URL is given', () => {
    const h = harness()
    h.registry.create('tab-blank')
    expect(h.backers[0]!.calls.loads).toEqual([])
  })

  it('setBounds positions and shows/hides the view', () => {
    const h = harness()
    const viewId = h.registry.create('tab-1')
    h.registry.setBounds(viewId, { x: 10, y: 20, width: 300, height: 400 }, true)
    expect(h.views[0]!.state.bounds).toEqual({ x: 10, y: 20, width: 300, height: 400 })
    expect(h.views[0]!.state.visible).toBe(true)
  })

  it('navigate honors history availability and drives reload/stop', () => {
    const h = harness()
    const viewId = h.registry.create('tab-1')
    const backer = h.backers[0]!

    // No history yet → back/forward are no-ops.
    h.registry.navigate(viewId, 'back')
    h.registry.navigate(viewId, 'forward')
    expect(backer.calls.goBack).toBe(0)
    expect(backer.calls.goForward).toBe(0)

    backer.nav.back = true
    backer.nav.forward = true
    h.registry.navigate(viewId, 'back')
    h.registry.navigate(viewId, 'forward')
    h.registry.navigate(viewId, 'reload')
    h.registry.navigate(viewId, 'stop')
    expect(backer.calls).toMatchObject({ goBack: 1, goForward: 1, reload: 1, stop: 1 })
  })

  it('loadUrl navigates an existing view', () => {
    const h = harness()
    const viewId = h.registry.create('tab-1')
    h.registry.loadUrl(viewId, 'https://example.com')
    expect(h.backers[0]!.calls.loads).toEqual(['https://example.com'])
  })

  it('pushes a browser.state event when the view navigates', () => {
    const h = harness()
    const viewId = h.registry.create('tab-1')
    const backer = h.backers[0]!
    backer.nav.url = 'https://idp.acme.dev/authorize'
    backer.nav.title = 'Authorize'
    backer.nav.loading = false
    backer.nav.back = true

    backer.fire('did-navigate')

    const state = h.emitted.find((e) => e.channel === IpcChannels.browser.state)
    expect(state?.payload).toEqual({
      viewId,
      url: 'https://idp.acme.dev/authorize',
      title: 'Authorize',
      loading: false,
      canGoBack: true,
      canGoForward: false
    } satisfies BrowserStateEvent)
  })

  it('dispose detaches the view, closes its contents, and forgets it', () => {
    const h = harness()
    const viewId = h.registry.create('tab-1')
    h.registry.dispose(viewId)

    expect(h.removed).toHaveLength(1)
    expect(h.backers[0]!.calls.closed).toBe(true)
    expect(h.registry.size).toBe(0)
    // A stale event from the disposed view no longer emits.
    h.emitted.length = 0
    h.backers[0]!.fire('did-navigate')
    expect(h.emitted).toEqual([])
  })

  it('disposeAll tears down every view', () => {
    const h = harness()
    h.registry.create('tab-1')
    h.registry.create('tab-2')
    expect(h.registry.size).toBe(2)
    h.registry.disposeAll()
    expect(h.registry.size).toBe(0)
    expect(h.removed).toHaveLength(2)
  })
})
