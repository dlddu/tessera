import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * M-J3-S2 (AC3.1 / AC3.2): direction A — a container tool's browser-open is
 * routed to a new **host** browser tab (T-3 scenario 2).
 *
 * A container workspace runs `xdg-open <url>`; the injected shim (installed at
 * `/usr/local/bin/xdg-open`, wired via `$BROWSER`) posts the URL to the host's
 * per-workspace routing channel over the vmnet gateway, the main process emits
 * `routing.openUrl`, and the renderer opens a new browser tab — a host
 * `WebContentsView` — showing that URL. We assert the new tab's address bar
 * (renderer DOM) carries the URL and the tab is titled by its host; the page
 * itself renders in the host view (AC3.1), never inside the container.
 *
 * Like the other M-J2/3 container specs this stands up a real Apple `container`
 * machine (macOS 26 + Apple Silicon + the `container` CLI), so it is NON-GATING:
 * it runs only when `TESSERA_CONTAINER_E2E=1` and is skipped everywhere else so
 * `npm run test:e2e` stays green. The guest shim needs `nc` **or** `bash` in the
 * image to reach the host; point `TESSERA_CONTAINER_IMAGE` at an image that has
 * one (e.g. a `debian`-based image) if the default lacks both.
 */
test.skip(
  !process.env['TESSERA_CONTAINER_E2E'],
  'requires a real Apple `container` runtime (set TESSERA_CONTAINER_E2E=1)'
)

const IMAGE = process.env['TESSERA_CONTAINER_IMAGE'] ?? 'ghcr.io/apple/container/init:latest'

/** The single *visible* terminal (inactive keep-alive slots are `hidden`). */
const VISIBLE_ROWS = '.surface-slot:not([hidden]) .xterm-rows'

test('container xdg-open routes the URL to a new host browser tab', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    // Create a container-machine workspace (create + boot to running).
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-backend-container').click()
    await window.getByTestId('ws-name').fill('cont-route')
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

    // Open a URL from inside the container — the injected xdg-open shim posts it
    // to the host routing channel.
    await terminal.click()
    await window.keyboard.type('xdg-open https://example.com/')
    await window.keyboard.press('Enter')

    // A new browser tab opens on the host with that URL in its address bar
    // (AC3.2), and the page renders in the host WebContentsView (AC3.1).
    await expect(window.getByTestId('browser-surface')).toBeVisible({ timeout: 30_000 })
    await expect(window.locator('.surface-slot:not([hidden]) .urlinput')).toHaveValue(
      /example\.com/,
      { timeout: 30_000 }
    )
    // The routing banner announces the intercept (M-J3-S1 copy).
    await expect(window.getByTestId('banner')).toContainText('브라우저 인증')
  } finally {
    await app.close()
  }
})
