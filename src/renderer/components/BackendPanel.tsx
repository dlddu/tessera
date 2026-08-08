/**
 * C-backend-panel (M-J2-S6, AC2.6): the container backend's lifecycle + a live
 * read on how responsive its terminals feel.
 *
 * The mockup draws one overlay card near the status bar with the machine's
 * status badge, its image and machine name, the measured terminal input→output
 * latency over a gauge, and the two lifecycle controls (정지 / 재시작). Every
 * visual here is an existing design-system class — `.bepanel`/`.behead`/
 * `.bebody`, `.metric`, `.gauge`, `.belife`, `.badge`, `.btn` — which the design
 * system has always defined but nothing consumed. Only placement is local
 * (inline styles, as {@link SurfacePicker} does), so `tessera.css` and the
 * mockups stay untouched.
 *
 * Presentational + controlled: the owning view holds the lifecycle state and
 * supplies the actions. `remove` (machine delete) is deliberately NOT a button
 * here — the mockup offers stop/restart only, and deleting a machine's storage
 * is not a one-click affordance; it reaches the same IPC from the workspace
 * close path.
 */
import type { CSSProperties } from 'react'
import type { BackendLifecycleState, BackendStatus } from '@shared/types'
import { LATENCY_TARGET_MS, latencyGaugeFraction } from '@renderer/surfaces/terminalLatencyRegistry'

interface BackendPanelProps {
  /** Machine name — the workspace id, as the container backend names it. */
  machine: string
  /** Image reference the machine boots from (e.g. `node:22`). */
  image: string
  /** Last known lifecycle state; `latencyMs` is the renderer's own measurement. */
  state: BackendLifecycleState
  /** True while a lifecycle action is in flight — the controls disable. */
  busy: boolean
  onStop: () => void
  onRestart: () => void
  onClose: () => void
}

/** Overlay placement: centered above the status bar, as in M-J2-S6. */
const WRAP: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: '36px',
  transform: 'translateX(-50%)',
  zIndex: 40,
  width: 'min(420px, 92%)'
}

/** The badge modifier each lifecycle status renders with. */
const STATUS_BADGE: Record<BackendStatus, string> = {
  running: 'live',
  starting: 'ro',
  stopped: 'down',
  error: 'down'
}

export function BackendPanel({
  machine,
  image,
  state,
  busy,
  onStop,
  onRestart,
  onClose
}: BackendPanelProps) {
  const latency = state.latencyMs ?? null
  const gauge = latencyGaugeFraction(latency)
  return (
    <div style={WRAP} data-testid="backend-panel">
      <div className="bepanel" style={{ width: '100%' }}>
        <div className="behead">
          <span className="mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <h3>컨테이너 백엔드</h3>
          <span
            className={`badge ${STATUS_BADGE[state.status]}`}
            style={{ marginLeft: 'auto' }}
            data-testid="backend-status-badge"
          >
            <span className="led" />
            {state.status}
          </span>
        </div>
        <div className="bebody">
          <div className="metric">
            <span className="mlabel">이미지</span>
            <span className="mval">{image}</span>
          </div>
          <div className="metric">
            <span className="mlabel">컨테이너</span>
            <span className="mval">{machine}</span>
          </div>
          <div>
            <div className="metric">
              <span className="mlabel">터미널 입력 지연</span>
              <span className="mval" data-testid="backend-latency">
                {latency === null ? '측정 전' : `${Math.round(latency)} ms`}
              </span>
            </div>
            <div className="gauge">
              <i style={{ width: `${Math.round(gauge * 100)}%` }} />
            </div>
            <div className="hint" style={{ marginTop: '5px' }}>
              호스트에 준하는 체감 응답성 (목표 &lt; {LATENCY_TARGET_MS} ms)
            </div>
          </div>
          {/* A failed action reports here rather than as a raw IPC rejection. */}
          {state.message ? (
            <div className="banner warn" data-testid="backend-message">
              <span className="bi">⚠</span>
              <span className="bmsg">{state.message}</span>
            </div>
          ) : null}
          <div className="belife">
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={onStop}
              data-testid="backend-stop"
            >
              정지
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={onRestart}
              data-testid="backend-restart"
            >
              재시작
            </button>
            <div className="spacer" style={{ flex: 1 }} />
            <button
              type="button"
              className="btn ghost sm"
              onClick={onClose}
              data-testid="backend-panel-close"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
