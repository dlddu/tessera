/**
 * C-browser (live): the renderer side of a browser tab (PRD-3, AC3.1). The page
 * itself is a host `WebContentsView` owned by the main process — always on the
 * host, even in a container workspace (AC3.1) — while this component owns the
 * chrome (address bar + back/forward/reload) and keeps the native view pinned
 * over the pane body.
 *
 * On mount it asks main to `browser.create` a view (loading `tab.url` when the
 * tab was opened onto a routed URL, AC3.2), then:
 *   - a rAF loop measures the `.bview` region and pushes its bounds + visibility
 *     to the view, so it tracks splits/resizes/zoom and hides (without being
 *     destroyed — the page keeps running) when the tab is inactive or a modal
 *     `.scrim` would otherwise sit behind it;
 *   - `browser.onState` drives the address bar, tab title (`onTitle`), persisted
 *     URL (`onUrl`, so a restored tab reopens where it was — AC4.4), and the
 *     nav-button enabled state.
 * On unmount it disposes the view (its tab was closed).
 */
import { useEffect, useRef, useState } from 'react'
import type { TabNode } from '@shared/types'

interface BrowserSurfaceProps {
  tab: TabNode
  /** Retitle the owning tab to the page's title. */
  onTitle: (title: string) => void
  /** Record the tab's current URL as it navigates (AC3.2 / AC4.4). */
  onUrl: (url: string) => void
}

interface NavState {
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/**
 * Coerce address-bar text into a loadable URL: pass an explicit scheme through,
 * otherwise assume `https://`. Empty input yields null (nothing to load).
 */
function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function BrowserSurface({ tab, onTitle, onUrl }: BrowserSurfaceProps) {
  const bviewRef = useRef<HTMLDivElement>(null)
  // Latest callbacks in refs so state pushes don't re-run the create effect
  // (which would dispose the view and respawn a fresh page every render).
  const onTitleRef = useRef(onTitle)
  onTitleRef.current = onTitle
  const onUrlRef = useRef(onUrl)
  onUrlRef.current = onUrl
  // The URL to load at creation, captured once. Later navigation is driven by
  // the view itself (loadURL / links), never by recreating it, so a changed
  // `tab.url` must NOT re-run the create effect.
  const initialUrlRef = useRef(tab.url)

  // The address-bar text and the live nav state. `address` is user-editable, so
  // it's only re-synced from the committed URL while the field isn't focused.
  const [address, setAddress] = useState(tab.url ?? '')
  const [nav, setNav] = useState<NavState>({
    url: tab.url ?? '',
    loading: false,
    canGoBack: false,
    canGoForward: false
  })
  const viewIdRef = useRef<string | null>(null)
  const editingRef = useRef(false)

  useEffect(() => {
    let disposed = false
    let raf = 0
    let lastBoundsKey = ''

    const offState = window.tessera.browser.onState((event) => {
      if (event.viewId !== viewIdRef.current) return
      setNav({
        url: event.url,
        loading: event.loading,
        canGoBack: event.canGoBack,
        canGoForward: event.canGoForward
      })
      // Don't fight the user mid-edit; sync the bar only when it isn't focused.
      if (!editingRef.current && event.url) setAddress(event.url)
      if (event.title) onTitleRef.current(event.title)
      if (event.url) onUrlRef.current(event.url)
    })

    // Track the native view to the `.bview` region every frame, but only emit
    // when the bounds/visibility actually change (most frames are no-ops), so a
    // steady layout costs one comparison per frame, not an IPC flood. Hidden
    // tabs (0×0) and a full-window modal `.scrim` (which the native view would
    // otherwise render on top of) fold into `visible = false`. The `.toast`
    // needs no hiding: it lives in the window title bar, fully outside the
    // `.bview` region, so it can never overlap the view.
    const syncBounds = (): void => {
      raf = requestAnimationFrame(syncBounds)
      const viewId = viewIdRef.current
      const el = bviewRef.current
      if (!viewId || !el) return
      const rect = el.getBoundingClientRect()
      const overlay = document.querySelector('.scrim') !== null
      const visible = rect.width > 1 && rect.height > 1 && !overlay
      const bounds = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
      const key = `${visible}|${bounds.x}|${bounds.y}|${bounds.width}|${bounds.height}`
      if (key === lastBoundsKey) return
      lastBoundsKey = key
      window.tessera.browser.setBounds({ viewId, bounds, visible })
    }

    const initialUrl = initialUrlRef.current
    window.tessera.browser
      .create({ tabId: tab.id, ...(initialUrl !== undefined ? { url: initialUrl } : {}) })
      .then(({ viewId }) => {
        if (disposed) {
          void window.tessera.browser.dispose({ viewId })
          return
        }
        viewIdRef.current = viewId
      })
      .catch(() => {
        // View creation failed — the chrome stays, but there's no page behind it.
      })

    raf = requestAnimationFrame(syncBounds)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      offState()
      const viewId = viewIdRef.current
      if (viewId) {
        viewIdRef.current = null
        void window.tessera.browser.dispose({ viewId })
      }
    }
    // Bound to the tab id only: a stable identity for the tab's whole life, so
    // the view is created once and survives every re-render / tab move.
  }, [tab.id])

  const submitAddress = (): void => {
    const url = normalizeUrl(address)
    const viewId = viewIdRef.current
    if (url && viewId) {
      window.tessera.browser.loadUrl({ viewId, url })
    }
  }

  const navigate = (action: 'back' | 'forward' | 'reload'): void => {
    const viewId = viewIdRef.current
    if (viewId) window.tessera.browser.navigate({ viewId, action })
  }

  return (
    <div className="browser" data-testid="browser-surface">
      <div className="bchrome">
        <div className="baddr">
          <span className="nav">
            <button
              type="button"
              className="navbtn"
              aria-label="뒤로"
              disabled={!nav.canGoBack}
              onClick={() => navigate('back')}
            >
              ‹
            </button>
            <button
              type="button"
              className="navbtn"
              aria-label="앞으로"
              disabled={!nav.canGoForward}
              onClick={() => navigate('forward')}
            >
              ›
            </button>
            <button
              type="button"
              className="navbtn"
              aria-label="새로고침"
              onClick={() => navigate('reload')}
            >
              ⟳
            </button>
          </span>
          <input
            className="urlinput mono"
            type="text"
            spellCheck={false}
            placeholder="URL 입력"
            aria-label="주소창"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => {
              editingRef.current = true
              e.currentTarget.select()
            }}
            onBlur={() => {
              editingRef.current = false
              // Snap the bar back to the committed URL when focus leaves.
              setAddress(nav.url)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editingRef.current = false
                submitAddress()
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                setAddress(nav.url)
                e.currentTarget.blur()
              }
            }}
          />
          {nav.loading ? <span className="bspin" aria-hidden="true" /> : null}
        </div>
      </div>
      {/* The native WebContentsView is positioned over this region by main. */}
      <div className="bview bview-live" ref={bviewRef} data-testid="browser-view" />
    </div>
  )
}
