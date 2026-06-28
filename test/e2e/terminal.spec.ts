import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

// Live host-shell terminal (M-J1-S2): create a workspace, then confirm the
// first (single) pane mounts a real terminal bound to a host PTY — it shows the
// shell's startup output and round-trips a deterministic marker command.
//
// Real PTYs are inherently timing-sensitive, so this favors generous waits and
// asserts terminal *visibility + output* before exercising input.
test('first tab runs a live host shell terminal', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()

    // empty state → ⌘N → fill the dialog → create.
    await expect(window.getByTestId('empty-state')).toBeVisible()
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-name').fill('e2e-term')
    await window.getByTestId('ws-cwd').fill(process.cwd())
    await window.getByTestId('ws-create').click()

    // The single pane mounts a live terminal surface.
    const terminal = window.getByTestId('terminal-surface')
    await expect(terminal).toBeVisible()
    await expect(window.getByTestId('empty-state')).toHaveCount(0)

    // Wait for the shell to print its prompt (PTY is alive and streaming).
    const rows = window.locator('.term-surface .xterm-rows')
    await expect
      .poll(async () => (await rows.innerText()).trim().length, { timeout: 15_000 })
      .toBeGreaterThan(0)

    // Round-trip a deterministic marker through the PTY.
    const marker = `TESSERA_OK_${Date.now()}`
    await terminal.click()
    await window.keyboard.type(`echo ${marker}`)
    await window.keyboard.press('Enter')

    await expect(rows).toContainText(marker, { timeout: 15_000 })
  } finally {
    await app.close()
  }
})
