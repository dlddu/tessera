/**
 * Live browser views (PRD-3, AC3.1). A browser tab's page is a host
 * `WebContentsView` — a real Chromium web view that always runs on the host,
 * whatever the workspace backend, so a container workspace never embeds a
 * browser (AC3.1). The renderer owns the tab chrome (address bar, nav buttons)
 * and this registry owns the view: create/position/navigate/destroy, plus a
 * `browser.state` event stream (committed URL, title, load + history state) that
 * drives the chrome.
 *
 * Electron's concrete `WebContentsView` / `BrowserWindow.contentView` are
 * injected through the narrow {@link ViewParent} / {@link ManagedView}
 * interfaces so the bookkeeping and event→event mapping are unit-testable with
 * fakes (the Electron glue lives in `main/index.ts`). The renderer positions
 * each view over its pane body and hides it (rather than destroying it) when its
 * tab is inactive or a DOM overlay covers it — so a backgrounded page keeps
 * running.
 */
import { IpcChannels } from '@shared/ipc'
import type { BrowserStateEvent, BrowserViewBounds } from '@shared/ipc'

/** The slice of Electron's `WebContents` the registry drives. */
export interface ManagedWebContents {
  loadURL(url: string): Promise<void>
  getURL(): string
  getTitle(): string
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  canGoBack(): boolean
  canGoForward(): boolean
  isLoading(): boolean
  isDestroyed(): boolean
  on(event: string, listener: () => void): void
  /** Close the underlying renderer when the view is disposed (Electron ≥30). */
  close?(): void
}

/** The slice of Electron's `WebContentsView` the registry drives. */
export interface ManagedView {
  readonly webContents: ManagedWebContents
  setBounds(rect: BrowserViewBounds): void
  setVisible(visible: boolean): void
}

/** The window content view a browser view is parented to. */
export interface ViewParent {
  addChildView(view: ManagedView): void
  removeChildView(view: ManagedView): void
}

/** Builds a fresh view (production: `new WebContentsView({...})`). */
export type CreateManagedView = () => ManagedView

/** Emits a main → renderer event (the window's `webContents.send`). */
export type BrowserEmit = (channel: string, payload: unknown) => void

/** WebContents lifecycle events that can change the navigation state we report. */
const STATE_EVENTS = [
  'did-navigate',
  'did-navigate-in-page',
  'page-title-updated',
  'did-start-loading',
  'did-stop-loading',
  'did-finish-load',
  'did-fail-load'
] as const

export class BrowserViewRegistry {
  private readonly views = new Map<string, ManagedView>()
  private counter = 0

  constructor(
    private readonly parent: ViewParent,
    private readonly createView: CreateManagedView,
    private readonly emit: BrowserEmit
  ) {}

  /**
   * Create a view for a browser tab, parent it (hidden until the renderer sends
   * bounds), wire its state stream, and load `url` when the tab opened onto one
   * (a routed open, AC3.2). Returns the id the renderer addresses it by.
   */
  create(tabId: string, url?: string): string {
    const viewId = `BV-${tabId}-${++this.counter}`
    const view = this.createView()
    this.views.set(viewId, view)
    this.parent.addChildView(view)
    // Hidden until the renderer measures its pane body and sends bounds, so it
    // never flashes at (0,0) over the layout on creation.
    view.setVisible(false)
    this.wireState(viewId, view)
    if (url) this.load(view, url)
    return viewId
  }

  /** Track a view to its pane body and show/hide it (keep-alive when hidden). */
  setBounds(viewId: string, bounds: BrowserViewBounds, visible: boolean): void {
    const view = this.views.get(viewId)
    if (!view) return
    view.setBounds(bounds)
    view.setVisible(visible)
  }

  /** Navigate a view to `url` (address-bar submit / routed open). */
  loadUrl(viewId: string, url: string): void {
    const view = this.views.get(viewId)
    if (view) this.load(view, url)
  }

  /** Drive a view's history/reload controls. */
  navigate(viewId: string, action: 'back' | 'forward' | 'reload' | 'stop'): void {
    const view = this.views.get(viewId)
    if (!view) return
    const wc = view.webContents
    if (wc.isDestroyed()) return
    if (action === 'back') {
      if (wc.canGoBack()) wc.goBack()
    } else if (action === 'forward') {
      if (wc.canGoForward()) wc.goForward()
    } else if (action === 'reload') {
      wc.reload()
    } else {
      wc.stop()
    }
  }

  /** Destroy a view when its tab closes (detach + close its renderer). */
  dispose(viewId: string): void {
    const view = this.views.get(viewId)
    if (!view) return
    this.views.delete(viewId)
    this.parent.removeChildView(view)
    if (!view.webContents.isDestroyed()) {
      view.webContents.close?.()
    }
  }

  /** Destroy every view (window/app teardown). */
  disposeAll(): void {
    for (const viewId of [...this.views.keys()]) {
      this.dispose(viewId)
    }
  }

  get size(): number {
    return this.views.size
  }

  private load(view: ManagedView, url: string): void {
    // A bad URL / aborted navigation rejects loadURL; swallow it — the view
    // stays put and the failure surfaces as an unchanged address bar.
    void view.webContents.loadURL(url).catch(() => {})
  }

  private wireState(viewId: string, view: ManagedView): void {
    const push = (): void => this.pushState(viewId, view)
    for (const event of STATE_EVENTS) {
      view.webContents.on(event, push)
    }
  }

  private pushState(viewId: string, view: ManagedView): void {
    const wc = view.webContents
    if (wc.isDestroyed()) return
    this.emit(IpcChannels.browser.state, {
      viewId,
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward()
    } satisfies BrowserStateEvent)
  }
}
