import { beforeEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
// Import the registry from its module directly, like the other surface
// registries: the surfaces barrel re-exports xterm/CodeMirror-backed surfaces,
// which are browser-only and would crash this node test environment.
import {
  LATENCY_TARGET_MS,
  MAX_SAMPLES,
  __resetTerminalLatencyRegistry,
  forgetTerminalLatency,
  latencyGaugeFraction,
  recordTerminalInput,
  recordTerminalOutput,
  terminalLatencyMs
} from '@renderer/surfaces/terminalLatencyRegistry'
import { BackendPanel } from '@renderer/components/BackendPanel'

describe('terminalLatencyRegistry — input→output round trips (AC2.6)', () => {
  beforeEach(() => {
    __resetTerminalLatencyRegistry()
  })

  it('has no latency before anything is measured', () => {
    expect(terminalLatencyMs('ws-1')).toBeNull()
  })

  it('closes a round trip on the first output after input', () => {
    recordTerminalInput('ws-1', 1000)

    expect(recordTerminalOutput('ws-1', 1008)).toBe(8)
    expect(terminalLatencyMs('ws-1')).toBe(8)
  })

  it('ignores unsolicited output, so idle chatter cannot fake a sample', () => {
    // A background process printing on its own — nothing was typed.
    expect(recordTerminalOutput('ws-1', 1000)).toBeNull()
    expect(terminalLatencyMs('ws-1')).toBeNull()
  })

  it('measures from the first of a burst of keystrokes, not the last', () => {
    // The user is still waiting on that first keystroke; measuring from the
    // newest one would under-report the delay they actually feel.
    recordTerminalInput('ws-1', 1000)
    recordTerminalInput('ws-1', 1005)
    recordTerminalInput('ws-1', 1009)

    expect(recordTerminalOutput('ws-1', 1020)).toBe(20)
  })

  it('disarms after a sample, so the next output needs fresh input', () => {
    recordTerminalInput('ws-1', 1000)
    recordTerminalOutput('ws-1', 1010)

    expect(recordTerminalOutput('ws-1', 1050)).toBeNull()
    expect(terminalLatencyMs('ws-1')).toBe(10)
  })

  it('reports the median, so one hiccup does not move the reading', () => {
    const samples = [8, 9, 250, 10, 11]
    samples.forEach((ms, i) => {
      recordTerminalInput('ws-1', i * 1000)
      recordTerminalOutput('ws-1', i * 1000 + ms)
    })

    expect(terminalLatencyMs('ws-1')).toBe(10)
  })

  it('averages the two middle samples for an even count', () => {
    for (const ms of [10, 20, 30, 40]) {
      recordTerminalInput('ws-1', 0)
      recordTerminalOutput('ws-1', ms)
    }

    expect(terminalLatencyMs('ws-1')).toBe(25)
  })

  it('retains only the most recent samples', () => {
    // Fill past the cap with a slow value, then flush it out with fast ones.
    for (let i = 0; i < MAX_SAMPLES; i++) {
      recordTerminalInput('ws-1', 0)
      recordTerminalOutput('ws-1', 500)
    }
    expect(terminalLatencyMs('ws-1')).toBe(500)

    for (let i = 0; i < MAX_SAMPLES; i++) {
      recordTerminalInput('ws-1', 0)
      recordTerminalOutput('ws-1', 5)
    }

    expect(terminalLatencyMs('ws-1')).toBe(5)
  })

  it('keeps workspaces independent', () => {
    recordTerminalInput('ws-1', 0)
    recordTerminalOutput('ws-1', 5)
    recordTerminalInput('ws-2', 0)
    recordTerminalOutput('ws-2', 90)

    expect(terminalLatencyMs('ws-1')).toBe(5)
    expect(terminalLatencyMs('ws-2')).toBe(90)

    forgetTerminalLatency('ws-1')

    expect(terminalLatencyMs('ws-1')).toBeNull()
    expect(terminalLatencyMs('ws-2')).toBe(90)
  })

  it('floors a non-monotonic clock at zero rather than recording a negative', () => {
    recordTerminalInput('ws-1', 1000)

    expect(recordTerminalOutput('ws-1', 990)).toBe(0)
  })
})

describe('latencyGaugeFraction — the M-J2-S6 responsiveness gauge', () => {
  it('is full at or under the host-parity target', () => {
    expect(latencyGaugeFraction(LATENCY_TARGET_MS)).toBe(1)
    expect(latencyGaugeFraction(4)).toBe(1)
  })

  it('is empty when nothing has been measured — nothing measured, nothing claimed', () => {
    expect(latencyGaugeFraction(null)).toBe(0)
  })

  it('falls off past the target and bottoms out well before absurd values', () => {
    const mid = latencyGaugeFraction(LATENCY_TARGET_MS * 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(latencyGaugeFraction(LATENCY_TARGET_MS * 4)).toBe(0)
    expect(latencyGaugeFraction(5000)).toBe(0)
  })
})

describe('BackendPanel markup (M-J2-S6)', () => {
  const render = (props: Partial<Parameters<typeof BackendPanel>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(BackendPanel, {
        machine: 'ws-api7f3',
        image: 'node:22',
        state: { status: 'running', latencyMs: 8 },
        busy: false,
        onStop: () => {},
        onRestart: () => {},
        onClose: () => {},
        ...props
      })
    )

  it('builds the mockup out of existing design-system classes only', () => {
    const html = render()
    // C-backend-panel: every visual class already exists in tessera.css, so this
    // adds no design-system drift (criterion ②).
    for (const cls of ['bepanel', 'behead', 'bebody', 'metric', 'gauge', 'belife']) {
      expect(html).toContain(cls)
    }
    expect(html).toContain('data-testid="backend-panel"')
  })

  it('shows the machine identity and a status badge matching the lifecycle state', () => {
    expect(render()).toContain('node:22')
    expect(render()).toContain('ws-api7f3')
    expect(render()).toContain('badge live')
    expect(render({ state: { status: 'stopped' } })).toContain('badge down')
    expect(render({ state: { status: 'error' } })).toContain('badge down')
  })

  it('renders the measured latency against the documented target', () => {
    const html = render()
    expect(html).toContain('8 ms')
    expect(html).toContain(`${LATENCY_TARGET_MS} ms`)
    // A full gauge at 8ms — comfortably inside the host-parity target.
    expect(html).toContain('width:100%')
  })

  it('says so plainly when nothing has been measured yet', () => {
    const html = render({ state: { status: 'running' } })
    expect(html).toContain('측정 전')
    expect(html).toContain('width:0%')
  })

  it('offers 정지 / 재시작 and disables them while an action is in flight', () => {
    expect(render()).toContain('data-testid="backend-stop"')
    expect(render()).toContain('data-testid="backend-restart"')
    expect(render()).not.toContain('disabled')
    expect(render({ busy: true })).toContain('disabled')
  })

  it('surfaces a failed action as a warning banner rather than swallowing it', () => {
    const html = render({
      state: { status: 'error', message: 'Apple `container` CLI를 찾을 수 없습니다.' }
    })
    expect(html).toContain('banner warn')
    expect(html).toContain('CLI를 찾을 수 없습니다')
  })
})
