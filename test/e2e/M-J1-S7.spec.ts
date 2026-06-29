import { test, expect, type Page } from '@playwright/test'
import { freshUserDataDir, launchApp } from './helpers'

// M-J1-S7: focused-pane zoom (전체화면) toggle (AC1.6). ⇧⌘⏎ zooms the focused
// pane to fill the window; Esc (or ⇧⌘⏎ again) restores the mosaic. Zoom is part
// of the persisted layout skeleton, so it survives a restart and follows focus.
//
// The headline properties asserted here:
//  - zoom hides the other panes but keeps them mounted — a hidden terminal keeps
//    its live PTY (and scrollback), proven by a marker that survives the zoom;
//  - the zoom badge appears while zoomed and the mosaic is exactly restored;
//  - zoom persists across a quit+relaunch (it's in the skeleton, not transient).

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

test('zoom fills one pane, keeps the others alive, and Esc restores the mosaic', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await createWorkspace(window, 'e2e-s7-zoom')

    // Round-trip a marker through the live shell so we can prove the terminal's
    // PTY (and scrollback) survives being hidden by the zoom.
    const terminal = window.getByTestId('terminal-surface')
    const rows = window.locator('.term-surface .xterm-rows')
    await expect
      .poll(async () => (await rows.innerText()).trim().length, { timeout: 15_000 })
      .toBeGreaterThan(0)
    const marker = `ZOOM_${Date.now()}`
    await terminal.click()
    await window.keyboard.type(`echo ${marker}`)
    await window.keyboard.press('Enter')
    await expect(rows).toContainText(marker, { timeout: 15_000 })

    // ⌘D → picker → Editor: split into a second (editor) pane, now focused.
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('editor-surface')).toBeVisible()
    await expect(window.getByTestId('pane')).toHaveCount(2)

    // ⌘T → picker → Browser: a second tab in the focused (editor) pane, so we can
    // exercise tab switching while zoomed.
    await window.keyboard.press('Meta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-browser').click()
    await expect(window.getByTestId('browser-surface')).toBeVisible()

    // ⇧⌘⏎ → zoom the focused pane. Badge appears; the other (terminal) pane is
    // hidden, though both panes remain in the DOM (the skeleton is unchanged).
    await window.keyboard.press('Meta+Shift+Enter')
    await expect(window.getByTestId('zoom-badge')).toBeVisible()
    await expect(window.getByTestId('pane')).toHaveCount(2)
    await expect(window.locator('.pane.zoomed')).toHaveCount(1)
    await expect(terminal).toBeHidden()

    // ⇧⌘[ / ⇧⌘] still switch tabs inside the zoomed pane.
    await window.keyboard.press('Meta+Shift+BracketLeft')
    await expect(window.getByTestId('editor-surface')).toBeVisible()
    await window.keyboard.press('Meta+Shift+BracketRight')
    await expect(window.getByTestId('browser-surface')).toBeVisible()

    // Esc → restore the mosaic: badge gone, both panes visible again, and the
    // terminal — hidden while zoomed — still carries its pre-zoom marker.
    await window.keyboard.press('Escape')
    await expect(window.getByTestId('zoom-badge')).toHaveCount(0)
    await expect(window.locator('.pane.zoomed')).toHaveCount(0)
    await expect(terminal).toBeVisible()
    await expect(rows).toContainText(marker)
  } finally {
    await app.close()
  }
})

test('zoom is persisted across a restart (it lives in the layout skeleton)', async () => {
  const userDataDir = freshUserDataDir()

  // ---- First launch: zoom a pane and let it autosave. ----
  const first = await launchApp(userDataDir)
  try {
    const window = await first.firstWindow()
    await createWorkspace(window, 'e2e-s7-persist')

    // ⌘D → Editor: a second pane, focused.
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('editor-surface')).toBeVisible()
    await expect(window.getByTestId('pane')).toHaveCount(2)

    // ⇧⌘⏎ → zoom; wait for the autosave so the zoomed skeleton lands on disk.
    await window.keyboard.press('Meta+Shift+Enter')
    await expect(window.getByTestId('zoom-badge')).toBeVisible()
    await expect(window.getByTestId('layout-saved-toast')).toBeVisible()
  } finally {
    await first.close()
  }

  // ---- Second launch: same userData → boots back into the zoomed state. ----
  const second = await launchApp(userDataDir)
  try {
    const window = await second.firstWindow()

    await expect(window.getByTestId('empty-state')).toHaveCount(0)
    // The zoom survived the restart: badge shown, one pane zoomed, two in the DOM.
    await expect(window.getByTestId('zoom-badge')).toBeVisible()
    await expect(window.getByTestId('pane')).toHaveCount(2)
    await expect(window.locator('.pane.zoomed')).toHaveCount(1)
    await expect(window.getByTestId('editor-surface')).toBeVisible()
  } finally {
    await second.close()
  }
})
