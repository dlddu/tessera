/**
 * C-terminal (live): an xterm.js terminal bound to a host-shell PTY (M-J1-S2).
 *
 * On mount it asks main to `surface.create` a terminal — which spawns the PTY —
 * then streams output in (`onPtyData` → `term.write`), input out
 * (`term.onData` → `surface.sendInput`), and keeps the PTY sized to the pane
 * (`ResizeObserver` → fit → `surface.resize`). On unmount it disposes both the
 * surface (killing the PTY) and the xterm instance.
 *
 * Visuals follow the C-terminal contract (mono font, block cursor, dark grout)
 * via the design-system tokens.
 */
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalSurfaceProps {
  workspaceId: string
  areaId: string
}

/** C-terminal palette, mapped from the design-system tokens (tessera.css). */
const TERMINAL_THEME = {
  background: '#0B0D12',
  foreground: '#c7cedd',
  cursor: '#56D3A6',
  cursorAccent: '#0B0D12',
  selectionBackground: '#2A3140',
  black: '#0B0D12',
  red: '#F0766B',
  green: '#56D3A6',
  yellow: '#E2A75A',
  blue: '#7CA2F8',
  magenta: '#B98BF0',
  cyan: '#56D3A6',
  white: '#E7EBF2',
  brightBlack: '#636C80'
} as const

export function TerminalSurface({ workspaceId, areaId }: TerminalSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const term = new Terminal({
      fontFamily: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: TERMINAL_THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    function safeFit() {
      try {
        fit.fit()
      } catch {
        // Element not laid out yet (zero size); a later ResizeObserver tick fits.
      }
    }
    safeFit()

    let surfaceId: string | null = null
    let unmounted = false

    const offData = window.tessera.surface.onPtyData((event) => {
      if (event.surfaceId === surfaceId) {
        term.write(event.chunk)
      }
    })
    const offExit = window.tessera.surface.onPtyExit((event) => {
      if (event.surfaceId === surfaceId) {
        term.write('\r\n\x1b[2m[프로세스가 종료되었습니다]\x1b[0m\r\n')
      }
    })

    const inputSub = term.onData((data) => {
      if (surfaceId) {
        window.tessera.surface.sendInput({ surfaceId, data })
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      safeFit()
      if (surfaceId) {
        window.tessera.surface.resize({ surfaceId, cols: term.cols, rows: term.rows })
      }
    })
    resizeObserver.observe(host)

    window.tessera.surface
      .create({ workspaceId, areaId, surface: 'terminal' })
      .then(({ surfaceId: id }) => {
        if (unmounted) {
          // Unmounted before the PTY was ready — tear it down immediately.
          void window.tessera.surface.dispose({ surfaceId: id })
          return
        }
        surfaceId = id
        // Push the measured geometry to the freshly spawned PTY.
        window.tessera.surface.resize({ surfaceId: id, cols: term.cols, rows: term.rows })
        term.focus()
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        term.write(`\r\n\x1b[31m터미널을 시작하지 못했습니다: ${message}\x1b[0m\r\n`)
      })

    return () => {
      unmounted = true
      offData()
      offExit()
      inputSub.dispose()
      resizeObserver.disconnect()
      if (surfaceId) {
        void window.tessera.surface.dispose({ surfaceId })
      }
      term.dispose()
    }
  }, [workspaceId, areaId])

  return <div className="term-surface" ref={hostRef} data-testid="terminal-surface" />
}
