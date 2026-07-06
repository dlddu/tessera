/**
 * C-terminal (live): an xterm.js terminal bound to a backend PTY (M-J1-S2).
 *
 * On mount it asks main to `surface.create` a terminal — which spawns the PTY —
 * then streams output in (`onPtyData` → `term.write`), input out
 * (`term.onData` → `surface.sendInput`), and keeps the PTY sized to the pane
 * (`ResizeObserver` → fit → `surface.resize`). On unmount it disposes both the
 * surface (killing the PTY) and the xterm instance.
 *
 * When the PTY exits on its own (the shell's `exit`/EOF, or the process dying)
 * it reports upward via `onExit`, so the shell can close the owning tab — a live
 * terminal and its tab share a lifetime. Absent that handler it falls back to
 * printing a "process exited" notice and leaving the (dead) terminal in place.
 *
 * On a container workspace the PTY execs *inside* the machine (AC2.3), so it has
 * no persistent cwd. To open a new container terminal where the last one was,
 * this surface tracks its live cwd via OSC 7 and reports focus into a shared
 * registry, then seeds a fresh terminal's `create` with the most-recently-
 * focused sibling's cwd (M-J2-S2). Host terminals skip all of this — they
 * already inherit the workspace cwd.
 *
 * Visuals follow the C-terminal contract (mono font, block cursor, dark grout)
 * via the design-system tokens.
 */
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { BackendKind } from '@shared/types'
import {
  forgetContainerTerminal,
  lastFocusedContainerCwd,
  parseOsc7Path,
  recordContainerCwd,
  recordContainerFocus
} from './terminalCwdRegistry'

interface TerminalSurfaceProps {
  workspaceId: string
  areaId: string
  /** The owning workspace's backend kind — container terminals exec into the machine. */
  backendKind: BackendKind
  /**
   * Called once the backing PTY exits on its own (shell `exit`/EOF), so the
   * owner can close this terminal's tab. Optional: without it the surface just
   * prints a "process exited" notice and stays put.
   */
  onExit?: () => void
  /**
   * Called with the PTY's live foreground-process name (`zsh`, `vim`, `node`, …)
   * whenever it changes, so the owner can retitle this terminal's tab. Optional:
   * without it the tab keeps its default title.
   */
  onTitle?: (title: string) => void
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

export function TerminalSurface({
  workspaceId,
  areaId,
  backendKind,
  onExit,
  onTitle
}: TerminalSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Hold the latest `onExit`/`onTitle` in refs so the mount effect can call them
  // without listing them as dependencies — a changed callback identity must NOT
  // re-run the effect, which would dispose the PTY and respawn a fresh shell on
  // every render.
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const onTitleRef = useRef(onTitle)
  onTitleRef.current = onTitle

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const isContainer = backendKind === 'container'

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
    // Container terminals report their title (OSC 0/2) via this xterm event; kept
    // here so the cleanup can dispose it. Host terminals leave it null (their tab
    // title comes from the main-side process poll instead).
    let titleSub: { dispose(): void } | null = null

    // Container terminals only: track the guest shell's live cwd (reported via
    // OSC 7) and which terminal was last focused, so the next container terminal
    // opens in the same directory (M-J2-S2).
    function onFocusIn() {
      if (surfaceId) {
        recordContainerFocus(workspaceId, surfaceId)
      }
    }
    if (isContainer) {
      term.parser.registerOscHandler(7, (payload) => {
        const cwd = parseOsc7Path(payload)
        if (cwd && surfaceId) {
          recordContainerCwd(workspaceId, surfaceId, cwd)
        }
        return true
      })
      // A container terminal's host PTY is the `container` CLI, so the process
      // poll can't name the guest's foreground process. Instead the guest reports
      // its title over OSC: our injected prompt hook emits the shell name each
      // prompt, and programs (vim, top, …) set their own. Mirror that into the tab.
      titleSub = term.onTitleChange((title) => {
        const name = title.trim()
        if (name) {
          onTitleRef.current?.(name)
        }
      })
      host.addEventListener('focusin', onFocusIn)
    }

    const offData = window.tessera.surface.onPtyData((event) => {
      if (event.surfaceId === surfaceId) {
        term.write(event.chunk)
      }
    })
    const offExit = window.tessera.surface.onPtyExit((event) => {
      if (event.surfaceId === surfaceId) {
        // Close the owning tab if the owner wired a handler; otherwise leave the
        // dead terminal with a notice. The notice is written first so it still
        // shows in that fallback (it's moot once the tab unmounts).
        term.write('\r\n\x1b[2m[프로세스가 종료되었습니다]\x1b[0m\r\n')
        onExitRef.current?.()
      }
    })
    // Live tab title: main polls the PTY's foreground-process name and pushes it
    // here on change, so the tab reads what's actually running (M-J1-S2).
    const offTitle = window.tessera.surface.onPtyTitle((event) => {
      if (event.surfaceId === surfaceId) {
        onTitleRef.current?.(event.title)
      }
    })

    const inputSub = term.onData((data) => {
      if (surfaceId) {
        window.tessera.surface.sendInput({ surfaceId, data })
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      // An inactive keep-alive tab is `display:none` (0×0, see `.surface-slot`).
      // The observer still fires then, but fitting a zero-size terminal snaps it
      // to xterm's 2×1 minimum and resizes the PTY to it — the guest shell
      // reflows/redraws at that tiny geometry, so the tab looks "reset" (and
      // loses lines) when shown again. Skip until it has a real size; the show
      // transition fires the observer again with the true geometry.
      if (host.clientWidth === 0 || host.clientHeight === 0) {
        return
      }
      safeFit()
      if (surfaceId) {
        window.tessera.surface.resize({ surfaceId, cols: term.cols, rows: term.rows })
      }
    })
    resizeObserver.observe(host)

    // Seed a new container terminal with the most-recently-focused sibling's cwd
    // (undefined for host terminals, or when no sibling has reported one yet).
    const inheritedCwd = isContainer ? lastFocusedContainerCwd(workspaceId) : undefined
    window.tessera.surface
      .create({
        workspaceId,
        areaId,
        surface: 'terminal',
        ...(inheritedCwd !== undefined ? { cwd: inheritedCwd } : {})
      })
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
      offTitle()
      inputSub.dispose()
      resizeObserver.disconnect()
      if (isContainer) {
        host.removeEventListener('focusin', onFocusIn)
        titleSub?.dispose()
        if (surfaceId) {
          forgetContainerTerminal(surfaceId)
        }
      }
      if (surfaceId) {
        void window.tessera.surface.dispose({ surfaceId })
      }
      term.dispose()
    }
  }, [workspaceId, areaId, backendKind])

  return <div className="term-surface" ref={hostRef} data-testid="terminal-surface" />
}
