/**
 * C-banner (design system). An inline status strip over the surface — used by
 * browser routing (PRD-3) to announce that a container's browser-auth request
 * was intercepted and routed to the host (M-J3-S1). Reuses the design-system
 * `.banner` classes; its `.banner` class also cues each live {@link BrowserSurface}
 * to hide its native view while the strip shows, so the DOM banner isn't covered
 * by a WebContentsView.
 *
 * `autoDismissMs` fires `onDismiss` after a delay, so a routing banner clears
 * itself; omit it (with no `onDismiss`) for a persistent banner.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'

export type BannerKind = 'info' | 'warn' | 'danger' | 'ok'

interface BannerProps {
  kind?: BannerKind
  /** Leading glyph; defaults to a per-kind icon. */
  icon?: string
  children: ReactNode
  onDismiss?: () => void
  /** Auto-dismiss after this many ms (requires `onDismiss`). */
  autoDismissMs?: number
}

const DEFAULT_ICON: Record<BannerKind, string> = {
  info: '◆',
  warn: '▲',
  danger: '■',
  ok: '✓'
}

export function Banner({ kind = 'info', icon, children, onDismiss, autoDismissMs }: BannerProps) {
  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return
    const timer = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(timer)
  }, [autoDismissMs, onDismiss])

  return (
    <div className={`banner ${kind}`} role="status" data-testid="banner">
      <span className="bi" aria-hidden="true">
        {icon ?? DEFAULT_ICON[kind]}
      </span>
      <span className="bmsg">{children}</span>
      {onDismiss ? (
        <span className="bact">
          <span className="banner-x" role="button" aria-label="배너 닫기" onMouseDown={onDismiss}>
            ×
          </span>
        </span>
      ) : null}
    </div>
  )
}
