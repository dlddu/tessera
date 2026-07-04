import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * M-J2-S4 (AC2.4): every pane/tab added to a container workspace's default area
 * inherits the *same* container environment — no backend mixing inside an area.
 *
 * Proven end-to-end across three surfaces born in the default area:
 *   1. Uniform backend — the first terminal, a second terminal opened as a new
 *      TAB, and a third opened as a new PANE (⌘D split) all report
 *      `TESSERA_BACKEND=container` (the host counterpart would be `host`).
 *   2. Same container — a marker file written from terminal 1 is visible from
 *      the other terminals, so they share one machine filesystem: identical
 *      environment, hostname, and working tree by construction (stronger than
 *      comparing `hostname` strings, and immune to prompt/echo noise).
 *   3. Same working directory — after `cd /tmp` in terminal 1, the new tab opens
 *      in `/tmp` (OSC 7-tracked cwd), and an editor tab's open affordance is the
 *      CONTAINER directory browser seeded with that same cwd — never the host
 *      picker. A browser tab renders (static in J2; always host-routed, AC3.1,
 *      so it is deliberately not part of the container area's env).
 *
 * Like M-J2-S1/S2/S3 this stands up a real Apple `container` machine, which
 * needs macOS 26 + Apple Silicon + the `container` CLI. Stock GitHub runners
 * can't nest virtualization, so this spec is NON-GATING: it runs only when
 * `TESSERA_CONTAINER_E2E=1` (a self-hosted Mac or local dev) and is skipped
 * everywhere else so `npm run test:e2e` stays green.
 *
 * cwd inheritance relies on the guest shell honouring the injected
 * `PROMPT_COMMAND` OSC 7 hook (bash). Point `TESSERA_CONTAINER_IMAGE` at an
 * image whose login shell is bash if the default lacks it.
 */
test.skip(
  !process.env['TESSERA_CONTAINER_E2E'],
  'requires a real Apple `container` runtime (set TESSERA_CONTAINER_E2E=1)'
)

const IMAGE = process.env['TESSERA_CONTAINER_IMAGE'] ?? 'ghcr.io/apple/container/init:latest'

/** Rows of the single *visible* terminal (inactive keep-alive slots are `hidden`). */
const VISIBLE_ROWS = '.surface-slot:not([hidden]) .xterm-rows'

/** cwd terminal 1 moves to; the new tab must inherit it. Exists in every image. */
const GUEST_CWD = '/tmp'
/** Shared marker: written from terminal 1, read from the others (same container). */
const MARKER_FILE = '/tmp/tessera-area-marker'
/** Sentinel content — appears only in `cat` output, never in the echoed command. */
const MARKER = 'AREA_UNIFORM_ENV'

test('every pane/tab in the default area inherits the same container env (no mixing)', async () => {
  // Machine boot + several terminals' worth of `machine run` far exceed the
  // suite's default 30s budget.
  test.setTimeout(300_000)

  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    // Create a container-machine workspace (create + boot to running).
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-backend-container').click()
    await window.getByTestId('ws-name').fill('cont-area')
    await window.getByTestId('ws-image').fill(IMAGE)
    await window.getByTestId('ws-homemount-rw').click()
    await window.getByTestId('ws-create').click()
    await expect(window.getByTestId('workspace-dialog')).toBeHidden({ timeout: 120_000 })

    // The status bar reads the container backend as `container · <image>` (M-J2-S4).
    await expect(window.getByTestId('statusbar')).toContainText('container ·')

    // Terminal 1 (the single pane's first tab) execs inside the machine.
    const terminal = window.getByTestId('terminal-surface')
    await expect(terminal).toBeVisible()
    const rows = window.locator(VISIBLE_ROWS)
    await expect
      .poll(async () => (await rows.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)

    // Terminal 1: runs in the container, drops the shared marker, and moves cwd.
    await terminal.click()
    await window.keyboard.type('echo be=$TESSERA_BACKEND')
    await window.keyboard.press('Enter')
    await expect(rows).toContainText('be=container', { timeout: 15_000 })

    await window.keyboard.type(`echo ${MARKER} > ${MARKER_FILE}`)
    await window.keyboard.press('Enter')
    await window.keyboard.type(`cd ${GUEST_CWD}`)
    await window.keyboard.press('Enter')
    await window.keyboard.type('pwd')
    await window.keyboard.press('Enter')
    await expect(rows).toContainText(GUEST_CWD, { timeout: 15_000 })

    // Terminal 2 — a NEW TAB in the same default area. Only the active tab is
    // visible (keep-alive), so `rows` now targets terminal 2 alone.
    await window.keyboard.press('ControlOrMeta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-terminal').click()
    const rows2 = window.locator(VISIBLE_ROWS)
    await expect
      .poll(async () => (await rows2.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)
    await rows2.click()

    // Inherited cwd, same backend, same container filesystem (sees the marker).
    await window.keyboard.type('pwd')
    await window.keyboard.press('Enter')
    await expect(rows2).toContainText(GUEST_CWD, { timeout: 15_000 })
    await window.keyboard.type('echo be=$TESSERA_BACKEND')
    await window.keyboard.press('Enter')
    await expect(rows2).toContainText('be=container', { timeout: 15_000 })
    await window.keyboard.type(`cat ${MARKER_FILE}`)
    await window.keyboard.press('Enter')
    await expect(rows2).toContainText(MARKER, { timeout: 15_000 })

    // Terminal 3 — a NEW PANE via ⌘D split. Two panes are now visible at once;
    // address the newly-focused (last) pane and prove it, too, is the same
    // container. The split inherits terminal 2's cwd, so it also opens in /tmp.
    await window.keyboard.press('ControlOrMeta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-terminal').click()
    await expect(window.getByTestId('terminal-surface')).toHaveCount(3)

    const pane3 = window.locator('.pane').last()
    const rows3 = pane3.locator('.xterm-rows')
    await expect
      .poll(async () => (await rows3.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)
    await pane3.locator('.term-surface').click()
    await window.keyboard.type('echo be=$TESSERA_BACKEND')
    await window.keyboard.press('Enter')
    await expect(rows3).toContainText('be=container', { timeout: 15_000 })
    await window.keyboard.type(`cat ${MARKER_FILE}`)
    await window.keyboard.press('Enter')
    await expect(rows3).toContainText(MARKER, { timeout: 15_000 })

    // An EDITOR tab in the same area browses the CONTAINER filesystem: its open
    // affordance is the machine directory browser (not the host picker), seeded
    // with the inherited cwd — the editor inherits the area's backend too.
    await pane3.locator('.term-surface').click()
    await window.keyboard.press('ControlOrMeta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await window.getByTestId('scratch-open').click()
    await expect(window.getByTestId('container-file-browser')).toBeVisible()
    await expect(window.getByTestId('cfb-path')).toHaveValue(GUEST_CWD)
    await window.getByTestId('cfb-cancel').click()

    // A BROWSER tab renders (static in J2 — smoke only). The browser is always
    // host-routed (AC3.1), so it is intentionally outside the container area's
    // env; this asserts nothing about $TESSERA_BACKEND.
    await window.keyboard.press('ControlOrMeta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-browser').click()
    await expect(window.getByTestId('browser-surface')).toBeVisible()
  } finally {
    await app.close()
  }
})
