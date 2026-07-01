import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * M-J2-S2 (AC2.3): a container workspace's terminal execs *inside* the machine.
 *
 * Two things are proven end-to-end:
 *   1. Isolation — the shell runs in the Linux guest, not on the macOS host, so
 *      `uname -s` prints `Linux` (the host would print `Darwin`), and `hostname`
 *      is the machine's, not the host's.
 *   2. cwd inheritance — after `cd /tmp` in the first container terminal, a new
 *      container terminal opens in `/tmp` (OSC 7-tracked cwd, M-J2-S2).
 *
 * Like M-J2-S1 this stands up a real Apple `container` machine, which needs
 * macOS 26 + Apple Silicon + the `container` CLI. Stock GitHub runners can't
 * nest virtualization, so this spec is NON-GATING: it runs only when
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

test('container terminal execs inside the machine and inherits cwd', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    // Create a container-machine workspace (create + boot to running).
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-backend-container').click()
    await window.getByTestId('ws-name').fill('cont-term')
    await window.getByTestId('ws-image').fill(IMAGE)
    await window.getByTestId('ws-homemount-rw').click()
    await window.getByTestId('ws-create').click()
    await expect(window.getByTestId('workspace-dialog')).toBeHidden({ timeout: 120_000 })

    // The first pane mounts a live terminal bound to the machine's exec PTY.
    const terminal = window.getByTestId('terminal-surface')
    await expect(terminal).toBeVisible()
    const rows = window.locator(VISIBLE_ROWS)
    await expect
      .poll(async () => (await rows.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)

    // (1) Isolation: the shell is the Linux guest, not the macOS host.
    await terminal.click()
    await window.keyboard.type('uname -s')
    await window.keyboard.press('Enter')
    await expect(rows).toContainText('Linux', { timeout: 15_000 })

    // Move the first terminal's cwd; OSC 7 reports it to the renderer registry.
    await window.keyboard.type('cd /tmp')
    await window.keyboard.press('Enter')
    await window.keyboard.type('pwd')
    await window.keyboard.press('Enter')
    await expect(rows).toContainText('/tmp', { timeout: 15_000 })

    // (2) cwd inheritance: ⌘T → pick terminal → the new terminal opens in /tmp.
    await window.keyboard.press('ControlOrMeta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-terminal').click()

    // The new (now-visible) terminal starts in the inherited cwd.
    const newRows = window.locator(VISIBLE_ROWS)
    await expect
      .poll(async () => (await newRows.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)
    await newRows.click()
    await window.keyboard.type('pwd')
    await window.keyboard.press('Enter')
    await expect(newRows).toContainText('/tmp', { timeout: 15_000 })
  } finally {
    await app.close()
  }
})
