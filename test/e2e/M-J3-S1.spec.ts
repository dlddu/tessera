import { resolve } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

/**
 * M-J3-S1 (AC3.2): a routed browser-open opens a new host browser tab and raises
 * the intercept banner.
 *
 * This exercises the renderer reception + browser surface without a container:
 * on a host workspace we invoke `routing.openUrlOnHost` (the same entry point the
 * terminal web-links click uses — the "tool only prints a URL" path of AC3.2),
 * which round-trips renderer → main `BrowserRouter` → `routing.openUrl` back to
 * the renderer. We assert the focused pane gains a browser tab whose address bar
 * shows the URL and that the M-J3-S1 info banner appears. The full container
 * `xdg-open` path is covered (gated) by M-J3-S2.
 *
 * Non-gating: needs only the built app (like the other renderer e2e), no
 * `container` runtime.
 */
test('a routed URL opens a host browser tab + intercept banner (AC3.2)', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    // Create a host workspace (the browser always runs on the host anyway, AC3.1).
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-name').fill('route-host')
    await window.getByTestId('ws-cwd').fill(process.cwd())
    await window.getByTestId('ws-create').click()
    await expect(window.getByTestId('workspace-dialog')).toBeHidden()

    // The workspace id is stamped on its surface for addressing the routed open.
    const workspaceId = await window
      .getByTestId('workspace-surface')
      .getAttribute('data-workspace-id')
    expect(workspaceId).toBeTruthy()

    // Simulate a routed browser-open (what the shim / web-links click triggers).
    // Use `globalThis` inside the page callback: the local `window` is the
    // Playwright Page, not the DOM window, so referencing it here would type-clash.
    await window.evaluate((id) => {
      ;(
        globalThis as unknown as {
          tessera: { routing: { openUrlOnHost(r: { workspaceId: string; url: string }): void } }
        }
      ).tessera.routing.openUrlOnHost({
        workspaceId: id,
        url: 'https://idp.acme.dev/authorize?scope=repo'
      })
    }, workspaceId as string)

    // A new browser tab opens with that URL in its address bar (AC3.2), rendered
    // by a host WebContentsView (AC3.1).
    await expect(window.getByTestId('browser-surface')).toBeVisible()
    await expect(window.locator('.surface-slot:not([hidden]) .urlinput')).toHaveValue(
      /idp\.acme\.dev/
    )
    // …and the intercept banner announces the routing (M-J3-S1 copy).
    await expect(window.getByTestId('banner')).toContainText('브라우저 인증')
  } finally {
    await app.close()
  }
})
