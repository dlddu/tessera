import { test, expect, type Page } from '@playwright/test'
import { launchApp } from './helpers'

// Terminal exit → tab close: when a live shell exits on its own (`exit`/EOF),
// its PTY closes and the owning tab closes with it — a terminal and its tab
// share a lifetime. When that terminal is the workspace's *last* surface,
// closing it closes the whole workspace instead of leaving it empty (AC1.7),
// matching what ⌘W / the tab × already do.

/** empty state → ⌘N → create a host workspace rooted at the repo dir. */
async function createWorkspace(window: Page, name: string) {
  await expect(window.getByTestId('empty-state')).toBeVisible()
  await window.keyboard.press('ControlOrMeta+n')
  await expect(window.getByTestId('workspace-dialog')).toBeVisible()
  await window.getByTestId('ws-name').fill(name)
  await window.getByTestId('ws-cwd').fill(process.cwd())
  await window.getByTestId('ws-create').click()
  await expect(window.getByTestId('terminal-surface')).toBeVisible()
}

/** Wait for the live shell to print its prompt (PTY is alive and streaming). */
async function waitForPrompt(window: Page) {
  const rows = window.locator('.term-surface .xterm-rows')
  await expect
    .poll(async () => (await rows.innerText()).trim().length, { timeout: 15_000 })
    .toBeGreaterThan(0)
}

test('exiting a terminal closes its tab, leaving its sibling', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await createWorkspace(window, 'e2e-exit-tab')
    await waitForPrompt(window)

    // ⌘T → picker → Editor: a second tab beside the terminal, so exiting the
    // terminal closes just its tab (not the whole workspace).
    await window.keyboard.press('Meta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('pane-tab')).toHaveCount(2)
    await expect(window.getByTestId('editor-surface')).toBeVisible()

    // ⌘⇧[ → back to the terminal tab, then exit its shell.
    await window.keyboard.press('Meta+Shift+BracketLeft')
    const terminal = window.getByTestId('terminal-surface')
    await expect(terminal).toBeVisible()
    await terminal.click()
    await window.keyboard.type('exit')
    await window.keyboard.press('Enter')

    // The terminal's tab closed on its own; the editor tab is all that remains.
    await expect(terminal).toHaveCount(0, { timeout: 15_000 })
    await expect(window.getByTestId('pane-tab')).toHaveCount(1)
    await expect(window.getByTestId('editor-surface')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('exiting the last terminal closes the workspace (AC1.7)', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await createWorkspace(window, 'e2e-exit-workspace')
    await waitForPrompt(window)

    // The terminal is the workspace's only surface: exiting it closes the
    // workspace, dropping back to the empty state.
    const terminal = window.getByTestId('terminal-surface')
    await terminal.click()
    await window.keyboard.type('exit')
    await window.keyboard.press('Enter')

    await expect(window.getByTestId('empty-state')).toBeVisible({ timeout: 15_000 })
    await expect(terminal).toHaveCount(0)
  } finally {
    await app.close()
  }
})
