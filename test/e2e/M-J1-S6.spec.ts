import { test, expect, type Page } from '@playwright/test'
import { freshUserDataDir, launchApp } from './helpers'

// M-J1-S6: layout-skeleton serialization + restore (AC1.5). Build a non-trivial
// window/pane/tab skeleton, quit, relaunch against the SAME userData, and prove
// the skeleton (pane count, tabs, component kinds) is reconstructed. Component
// *content* (shell scrollback, editor buffer, browser URL) is explicitly NOT
// asserted — that's J4/PRD-4. The two launches share one userData dir so the
// second boot reads what the first persisted.

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

test('rebuilds the window/pane/tab skeleton after a restart', async () => {
  const userDataDir = freshUserDataDir()

  // ---- First launch: build a skeleton and let it autosave. ----
  const first = await launchApp(userDataDir)
  try {
    const window = await first.firstWindow()
    await createWorkspace(window, 'e2e-s6')

    // ⌘D → picker → Editor: split into a second (editor) pane. Focus follows it.
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('editor-surface')).toBeVisible()
    await expect(window.getByTestId('pane')).toHaveCount(2)

    // ⌘T → picker → Browser: add a browser tab to the (focused) editor pane.
    await window.keyboard.press('Meta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-browser').click()
    await expect(window.getByTestId('browser-surface')).toBeVisible()
    await expect(window.getByTestId('pane-tab')).toHaveCount(3) // terminal + editor + browser

    // Confirm the autosave landed: the "saved ✓" toast appears after the debounce.
    await expect(window.getByTestId('layout-saved-toast')).toBeVisible()
  } finally {
    await first.close()
  }

  // ---- Second launch: same userData → the skeleton is restored. ----
  const second = await launchApp(userDataDir)
  try {
    const window = await second.firstWindow()

    // No empty state — we boot straight into the restored workspace.
    await expect(window.getByTestId('empty-state')).toHaveCount(0)
    await expect(window.getByTestId('statusbar')).toContainText('e2e-s6')

    // Same skeleton: two panes and the same three tabs / component kinds.
    await expect(window.getByTestId('pane')).toHaveCount(2)
    await expect(window.getByTestId('pane-tab')).toHaveCount(3)
    // The editor pane's active tab was the browser; the terminal pane is live too.
    await expect(window.getByTestId('browser-surface')).toBeVisible()
    await expect(window.getByTestId('terminal-surface')).toBeVisible()
  } finally {
    await second.close()
  }
})
