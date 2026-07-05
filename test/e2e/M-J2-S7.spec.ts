import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * M-J2-S7 (AC2.7·AC2.8): a container workspace can open an optional host-only
 * area whose tools run on the host, while the container default area stays
 * isolated — and the boundary between them is explicit.
 *
 * Proven end-to-end (T-2 시나리오 7·8):
 *   1. Default = container-only — before any host area is opened there are no
 *      area bands and the first terminal reports `TESSERA_BACKEND=container`.
 *   2. Host tools on the host — ⌃⌘H opens the host area; its terminal reports
 *      `TESSERA_BACKEND=host` and `uname -s` = `Darwin` (the macOS host; the
 *      container would print `Linux`).
 *   3. Explicit boundary — two area bands ("컨테이너 기본 영역" / "HOST 전용
 *      영역"), the title-bar "host 영역" badge, and the "+ host 영역 · N pane"
 *      status segment all appear (AC2.8).
 *   4. Isolation preserved — a marker file written in the container area is NOT
 *      visible from the host area, and a marker written in the host area is NOT
 *      visible from the container area: the two areas share no filesystem
 *      (/tmp is not mounted across the boundary). The container's own marker is
 *      still readable in the container area — its isolation is untouched (AC2.8).
 *   5. ⇧⌃⌘H closes the host area, collapsing back to container-only.
 *
 * Like M-J2-S1..S5 this stands up a real Apple `container` machine (macOS 26 +
 * Apple Silicon + the `container` CLI), which stock CI runners can't nest — so
 * it is NON-GATING: it runs only when `TESSERA_CONTAINER_E2E=1` and is skipped
 * everywhere else so `npm run test:e2e` stays green.
 */
test.skip(
  !process.env['TESSERA_CONTAINER_E2E'],
  'requires a real Apple `container` runtime (set TESSERA_CONTAINER_E2E=1)'
)

const IMAGE = process.env['TESSERA_CONTAINER_IMAGE'] ?? 'ghcr.io/apple/container/init:latest'

/** Rows of the single *visible* terminal (used before the host area is opened). */
const VISIBLE_ROWS = '.surface-slot:not([hidden]) .xterm-rows'

/** Markers proving the two areas share no filesystem (/tmp is not cross-mounted). */
const CONTAINER_MARKER_FILE = '/tmp/tessera-s7-container-marker'
const CONTAINER_MARKER = 'S7_CONTAINER_ONLY'
const HOST_MARKER_FILE = '/tmp/tessera-s7-host-marker'
const HOST_MARKER = 'S7_HOST_ONLY'

test('host-only area runs host tools while the container area stays isolated', async () => {
  // Machine boot + several `machine run` execs far exceed the default 30s.
  test.setTimeout(300_000)

  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    // Create a container-machine workspace (create + boot to running).
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-backend-container').click()
    await window.getByTestId('ws-name').fill('s7-host-area')
    await window.getByTestId('ws-image').fill(IMAGE)
    await window.getByTestId('ws-homemount-rw').click()
    await window.getByTestId('ws-create').click()
    await expect(window.getByTestId('workspace-dialog')).toBeHidden({ timeout: 120_000 })

    // (1) Default = container-only: no host area is open, so no area bands, no
    // host-area badge — everything runs in the container.
    await expect(window.getByTestId('area')).toHaveCount(0)
    await expect(window.getByTestId('host-area-badge')).toHaveCount(0)

    const containerTerminal = window.getByTestId('terminal-surface')
    await expect(containerTerminal).toBeVisible()
    const firstRows = window.locator(VISIBLE_ROWS)
    await expect
      .poll(async () => (await firstRows.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)

    // The container terminal runs in the container; drop a marker in its /tmp.
    await containerTerminal.click()
    await window.keyboard.type('echo be=$TESSERA_BACKEND')
    await window.keyboard.press('Enter')
    await expect(firstRows).toContainText('be=container', { timeout: 15_000 })
    await window.keyboard.type(`echo ${CONTAINER_MARKER} > ${CONTAINER_MARKER_FILE}`)
    await window.keyboard.press('Enter')

    // (2)/(3) ⌃⌘H opens the host-only area; the boundary is now explicit (AC2.8).
    await window.keyboard.press('Control+Meta+h')
    await expect(window.getByTestId('area')).toHaveCount(2)
    await expect(window.locator('[data-area-kind="default"]')).toContainText('컨테이너 기본 영역')
    await expect(window.locator('[data-area-kind="host"]')).toContainText('HOST 전용 영역')
    await expect(window.getByTestId('host-area-badge')).toBeVisible()
    await expect(window.getByTestId('host-area-segment')).toContainText('+ host 영역')

    // The host area's terminal execs on the macOS host: backend=host, uname=Darwin.
    const hostAreaEl = window.locator('[data-area-kind="host"]')
    const hostRows = hostAreaEl.locator('.xterm-rows')
    await expect
      .poll(async () => (await hostRows.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)
    await hostAreaEl.locator('.term-surface').click()
    await window.keyboard.type('echo be=$TESSERA_BACKEND')
    await window.keyboard.press('Enter')
    await expect(hostRows).toContainText('be=host', { timeout: 15_000 })
    await window.keyboard.type('uname -s')
    await window.keyboard.press('Enter')
    await expect(hostRows).toContainText('Darwin', { timeout: 15_000 })

    // (4) Isolation: the container's marker is NOT on the host filesystem, and
    // the host area drops its own marker for the reverse check.
    await window.keyboard.type(`cat ${CONTAINER_MARKER_FILE} 2>&1`)
    await window.keyboard.press('Enter')
    await expect(hostRows).toContainText('No such file', { timeout: 15_000 })
    await window.keyboard.type(`echo ${HOST_MARKER} > ${HOST_MARKER_FILE}`)
    await window.keyboard.press('Enter')

    // Back in the container area: the host marker is NOT in the container fs, and
    // the container's own marker is still readable — its isolation is untouched.
    const containerAreaEl = window.locator('[data-area-kind="default"]')
    const containerRows = containerAreaEl.locator('.xterm-rows')
    await containerAreaEl.locator('.term-surface').click()
    await window.keyboard.type(`cat ${HOST_MARKER_FILE} 2>&1`)
    await window.keyboard.press('Enter')
    await expect(containerRows).toContainText('No such file', { timeout: 15_000 })
    await window.keyboard.type(`cat ${CONTAINER_MARKER_FILE}`)
    await window.keyboard.press('Enter')
    await expect(containerRows).toContainText(CONTAINER_MARKER, { timeout: 15_000 })

    // (5) ⇧⌃⌘H closes the host area — collapse back to a single container area.
    await window.keyboard.press('Shift+Control+Meta+h')
    await expect(window.getByTestId('area')).toHaveCount(0)
    await expect(window.getByTestId('host-area-badge')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
