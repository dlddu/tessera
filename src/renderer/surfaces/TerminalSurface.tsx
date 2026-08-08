/**
 * C-terminal (live): an xterm.js terminal bound to a backend PTY (M-J1-S2).
 *
 * On mount it asks main to `surface.create` a terminal — which spawns the PTY —
 * then streams output in (`onPtyData` → `term.write`), input out
 * (`term.onData` → `surface.sendInput`), and keeps the PTY sized to the pane
 * (`ResizeObserver` → fit → `surface.resize`). On unmount it disposes both the
 * surface (killing the PTY) and the xterm instance.
 *
 * When the PTY exits *cleanly* (the shell's `exit`/EOF) it reports upward via
 * `onExit`, so the shell can close the owning tab — a live terminal and its tab
 * share a lifetime. Absent that handler it falls back to printing a "process
 * exited" notice and leaving the (dead) terminal in place.
 *
 * An *abnormal* exit is the opposite case (AC4.3, J4-S1): the backend died under
 * the terminal, so closing the tab would delete the very screen the user needs.
 * The surface instead **freezes** — it keeps the preserved screen and scrollback
 * on display, stops forwarding keystrokes (there is no PTY to send them to), and
 * offers a reconnect that spawns a fresh PTY under the same xterm, leaving the
 * dead session's output above it as history (the J4-S3 rehydrate shape, produced
 * live rather than from a snapshot).
 *
 * The screen and scrollback are also the workspace's restorable content (AC4.3):
 * this surface registers a getter into {@link terminalScrollbackRegistry} so the
 * autosave can persist them host-side (AC4.5), nudges that autosave as output
 * arrives, and on mount replays any preserved history above the freshly spawned
 * PTY — the J4-S3 rehydrate shape (a working shell with the dead session's
 * output readable above it).
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
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { BackendKind } from '@shared/types'
import {
  forgetContainerTerminal,
  lastFocusedContainerCwd,
  parseOsc7Path,
  recordContainerCwd,
  recordContainerFocus
} from './terminalCwdRegistry'
import { recordTerminalInput, recordTerminalOutput } from './terminalLatencyRegistry'
import {
  forgetTerminalState,
  formatFrozenNotice,
  formatReconnectedHeader,
  formatRestoredScrollback,
  isAbnormalPtyExit,
  notifyTerminalChanged,
  registerTerminalState,
  takeTerminalRestore,
  trimScrollbackLines
} from './terminalScrollbackRegistry'

/**
 * Read a terminal's scrollback + current screen as plain-text lines. `baseY` is
 * the scrollback height, so `baseY + rows` walks the whole buffer top to bottom;
 * `translateToString(true)` right-trims each row's padding.
 */
function readScrollbackLines(term: Terminal): string[] {
  const buffer = term.buffer.active
  const lines: string[] = []
  const end = buffer.baseY + term.rows
  for (let y = 0; y < end; y += 1) {
    lines.push(buffer.getLine(y)?.translateToString(true) ?? '')
  }
  return trimScrollbackLines(lines)
}

interface TerminalSurfaceProps {
  workspaceId: string
  /** The owning tab — the key this terminal's restorable scrollback is stored under (AC4.3). */
  tabId: string
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
  tabId,
  areaId,
  backendKind,
  onExit,
  onTitle
}: TerminalSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Whether the backing PTY died abnormally and this terminal is now a read-only
  // preserved screen (AC4.3). Drives the M-J4-S1 overlay below; the read-only
  // half is enforced inside the effect by dropping the surface id.
  const [frozen, setFrozen] = useState(false)
  // Set by the mount effect to a "spawn a fresh PTY under this xterm" closure,
  // so the overlay's button can reach into the effect's scope.
  const reconnectRef = useRef<(() => void) | null>(null)
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
    // Make URLs printed by a tool clickable, and route a click to the host
    // Tessera browser (direction A, AC3.2) rather than the OS browser — the
    // in-app path for the "tool only prints a URL" case, and the same for host
    // and container terminals so their operation stays identical (AC2.5).
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        window.tessera.routing.openUrlOnHost({ workspaceId, url: uri })
      })
    )
    term.open(host)

    // Replay the previous session's screen + scrollback as history, before the
    // new PTY starts writing into the buffer (AC4.3, J4-S3). Absent for a fresh
    // tab or a snapshot that predates terminal restore.
    const restored = takeTerminalRestore(workspaceId, tabId)
    if (restored) {
      term.write(formatRestoredScrollback(restored.lines))
    }

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
        // Close the input→output round trip this chunk answers, if any, so the
        // backend panel can report the workspace's terminal latency (AC2.6).
        // Unsolicited output (a background process printing) records nothing.
        recordTerminalOutput(workspaceId, Date.now())
        // Output doesn't touch the layout, so nudge the workspace autosave to
        // persist this scrollback (AC4.3). Throttled inside the registry — a
        // build log firehose would otherwise re-arm the debounce forever.
        notifyTerminalChanged(workspaceId, Date.now())
      }
    })
    const offExit = window.tessera.surface.onPtyExit((event) => {
      if (event.surfaceId !== surfaceId) {
        return
      }
      if (!isAbnormalPtyExit(event)) {
        // Clean `exit`/EOF. Close the owning tab if the owner wired a handler;
        // otherwise leave the dead terminal with a notice. The notice is written
        // first so it still shows in that fallback (it's moot once the tab
        // unmounts).
        term.write('\r\n\x1b[2m[프로세스가 종료되었습니다]\x1b[0m\r\n')
        onExitRef.current?.()
        return
      }
      // The backend died under us (non-zero code, or killed by a signal — a
      // force-kill reports code 0 plus a signal). Freeze instead of closing the
      // tab: the screen and scrollback stay on display, read-only, until the
      // user reconnects (AC4.3, M-J4-S1).
      if (isContainer) {
        forgetContainerTerminal(surfaceId)
      }
      // Dropping the id is what makes the terminal read-only — `term.onData`
      // and the resize observer both no-op without it.
      surfaceId = null
      term.write(formatFrozenNotice())
      // Best-effort persist of the final screen. Throttled inside the registry,
      // so a terminal that died mid-firehose may miss this nudge — harmless,
      // because the tab stays open and its getter stays registered, so the next
      // autosave still captures the frozen content (AC4.5).
      notifyTerminalChanged(workspaceId, Date.now())
      setFrozen(true)
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
        // Start (or keep) the round trip the next output chunk closes (AC2.6).
        recordTerminalInput(workspaceId, Date.now())
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

    // Publish this terminal's live screen + scrollback so the workspace autosave
    // can capture it at persist time (AC4.3), the same way an editor publishes
    // its buffer.
    registerTerminalState(workspaceId, tabId, () => ({ lines: readScrollbackLines(term) }))

    /**
     * Spawn a PTY and bind this surface to it. Runs once on mount, and again for
     * each reconnect after a freeze — the same call either way, so a reconnected
     * terminal is an ordinary live terminal that happens to have the dead
     * session's output above it (AC4.3).
     */
    function spawn(): void {
      // Seed a new container terminal with the most-recently-focused sibling's
      // cwd (undefined for host terminals, or when no sibling has reported one).
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
          // Keep (or raise) the frozen overlay so the failure is recoverable: a
          // container whose machine is gone needs its backend restarted first
          // (AC2.6), and the user can retry once it is.
          setFrozen(true)
        })
    }

    reconnectRef.current = () => {
      // Ignore a stray click once a PTY is already bound.
      if (surfaceId) {
        return
      }
      setFrozen(false)
      term.write(formatReconnectedHeader())
      spawn()
    }
    spawn()

    return () => {
      unmounted = true
      reconnectRef.current = null
      forgetTerminalState(workspaceId, tabId)
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
  }, [workspaceId, tabId, areaId, backendKind])

  return (
    <div
      className={frozen ? 'term-surface term-surface--frozen' : 'term-surface'}
      data-testid="terminal-surface"
    >
      <div className="term-surface__view" ref={hostRef} />
      {frozen ? (
        // The M-J4-S1 read-only treatment, drawn entirely from design-system
        // classes (C-banner danger, C-badge ro, C-button) over the dimmed screen.
        <div className="term-surface__frozen" data-testid="terminal-frozen">
          <div className="banner danger">
            <span className="bi">⚠</span>
            <span className="bmsg">
              백엔드 연결 끊김 — 위는 <b>읽기 전용 보존 화면</b>입니다. 맥락은 유지되지만 아직
              동작하는 복원이 아닙니다.
            </span>
          </div>
          <div className="term-surface__frozen-actions">
            <button
              type="button"
              className="btn primary sm"
              onClick={() => reconnectRef.current?.()}
            >
              재연결
            </button>
            <span className="badge ro">
              <span className="led" />
              읽기 전용
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
