import { resolve } from 'node:path'
import { test, expect, _electron as electron, type Page } from '@playwright/test'

// M-J1-S4: four component surfaces coexisting in a 2×2 mosaic (AC1.1·AC1.2).
// Every surface-creation path runs through the shared picker: ⌘D / ⌘⇧D split the
// focused pane (vertical/horizontal) and the tab "+" adds a tab — each opening
// the picker first so the user chooses the kind. The journey (S4) reaches the
// 2×2 by repeated splits, not by an initial 2×2 layout.

/** empty state → ⌘N → create a host workspace rooted at the repo dir. */
async function createWorkspace(window: Page) {
  await expect(window.getByTestId('empty-state')).toBeVisible()
  await window.keyboard.press('ControlOrMeta+n')
  await expect(window.getByTestId('workspace-dialog')).toBeVisible()
  await window.getByTestId('ws-name').fill('e2e-s4')
  await window.getByTestId('ws-cwd').fill(process.cwd())
  await window.getByTestId('ws-create').click()
  await expect(window.getByTestId('terminal-surface')).toBeVisible()
}

test('reaches a 2×2 mosaic with all four surfaces via the picker', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    await createWorkspace(window)

    // Start: a single terminal pane in one column.
    await expect(window.locator('.surface > .col')).toHaveCount(1)
    await expect(window.getByTestId('pane')).toHaveCount(1)

    // ⌘D → picker → Browser: vertical split → two columns (terminal | browser).
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-browser').click()
    await expect(window.getByTestId('browser-surface')).toBeVisible()
    await expect(window.locator('.surface > .col')).toHaveCount(2)

    // Focus the terminal pane, then ⌘⇧D → picker → Editor: split the left column.
    const termPane = window.locator('[data-testid="pane"]', {
      has: window.getByTestId('terminal-surface')
    })
    await termPane.getByTestId('pane-tab').click()
    await window.keyboard.press('Meta+Shift+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('editor-surface')).toBeVisible()

    // Focus the browser pane, then ⌘⇧D → picker → Claude: split the right column.
    const browserPane = window.locator('[data-testid="pane"]', {
      has: window.getByTestId('browser-surface')
    })
    await browserPane.getByTestId('pane-tab').click()
    await window.keyboard.press('Meta+Shift+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-claude').click()
    await expect(window.getByTestId('claude-surface')).toBeVisible()

    // 2×2 reached: two columns, four panes, all four surfaces on screen at once.
    await expect(window.locator('.surface > .col')).toHaveCount(2)
    await expect(window.getByTestId('pane')).toHaveCount(4)
    await expect(window.getByTestId('terminal-surface')).toBeVisible()
    await expect(window.getByTestId('editor-surface')).toBeVisible()
    await expect(window.getByTestId('browser-surface')).toBeVisible()
    await expect(window.getByTestId('claude-surface')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the tab "+" opens the picker and adds the chosen surface as a tab', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    await createWorkspace(window)

    // One pane, one (terminal) tab.
    await expect(window.getByTestId('pane-tab')).toHaveCount(1)

    // "+" → picker → Claude: a second tab is added to the same pane (no split).
    await window.getByTestId('tab-add').click()
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-claude').click()

    await expect(window.getByTestId('pane-tab')).toHaveCount(2)
    await expect(window.getByTestId('claude-surface')).toBeVisible()
    await expect(window.locator('.surface > .col')).toHaveCount(1)
  } finally {
    await app.close()
  }
})
