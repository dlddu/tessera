import { resolve } from 'node:path'
import { test, expect, _electron as electron, type Page } from '@playwright/test'

// M-J1-S5: tab drag between panes (AC1.3) + keyboard pane focus / tab switch /
// tab move (AC1.4), on top of the keep-alive SurfaceHost. The headline property
// is that moving a tab never remounts its surface — a dragged terminal keeps
// its live PTY (and scrollback) — which the drag test asserts directly.

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

/** Drag a tab onto the center of a target element via pointer events. */
async function dragTabOnto(
  window: Page,
  tab: ReturnType<Page['locator']>,
  target: ReturnType<Page['locator']>
) {
  const from = await tab.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('missing bounding box for drag')
  await window.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await window.mouse.down()
  // Move in steps so the drag passes its threshold and hit-tests the target.
  await window.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 6 })
  await window.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await window.mouse.up()
}

test('dragging a tab to another pane moves it and keeps its live PTY', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    await createWorkspace(window, 'e2e-s5-drag')

    // Round-trip a marker through the live shell so we can prove the PTY (and
    // its scrollback) survives the move.
    const terminal = window.getByTestId('terminal-surface')
    const rows = window.locator('.term-surface .xterm-rows')
    await expect
      .poll(async () => (await rows.innerText()).trim().length, { timeout: 15_000 })
      .toBeGreaterThan(0)
    const marker = `KEEPALIVE_${Date.now()}`
    await terminal.click()
    await window.keyboard.type(`echo ${marker}`)
    await window.keyboard.press('Enter')
    await expect(rows).toContainText(marker, { timeout: 15_000 })

    // ⌘D → picker → Editor: split into a second (editor) pane.
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('editor-surface')).toBeVisible()
    await expect(window.getByTestId('pane')).toHaveCount(2)

    // Drag the terminal's tab onto the editor pane.
    const termPane = window.locator('[data-testid="pane"]', {
      has: window.getByTestId('terminal-surface')
    })
    const termTab = termPane.getByTestId('pane-tab')
    const editorPane = window.locator('[data-testid="pane"]', {
      has: window.getByTestId('editor-surface')
    })
    await dragTabOnto(window, termTab, editorPane)

    // The source pane drained and collapsed: one pane now holds both tabs, with
    // the moved terminal active — and still showing the marker from before.
    await expect(window.getByTestId('pane')).toHaveCount(1)
    await expect(window.getByTestId('pane-tab')).toHaveCount(2)
    await expect(terminal).toBeVisible()
    await expect(rows).toContainText(marker)
  } finally {
    await app.close()
  }
})

test('keyboard drives pane focus, tab switch, and cross-pane tab move (AC1.4)', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    await createWorkspace(window, 'e2e-s5-keys')

    // ⌘T → picker → Editor: a second tab in the same pane, active editor.
    await window.keyboard.press('Meta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('pane-tab')).toHaveCount(2)
    await expect(window.getByTestId('editor-surface')).toBeVisible()

    // ⌘⇧[ → previous tab (terminal); ⌘⇧] → back to editor.
    await window.keyboard.press('Meta+Shift+BracketLeft')
    await expect(window.getByTestId('terminal-surface')).toBeVisible()
    await expect(window.getByTestId('editor-surface')).toBeHidden()
    await window.keyboard.press('Meta+Shift+BracketRight')
    await expect(window.getByTestId('editor-surface')).toBeVisible()

    // ⌘D → picker → Browser: split into a second pane (browser, now focused).
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-browser').click()
    await expect(window.getByTestId('browser-surface')).toBeVisible()
    await expect(window.getByTestId('pane')).toHaveCount(2)

    // ⌥⌘← moves focus to the left (editor/terminal) pane; ⌥⌘→ back to browser.
    await window.keyboard.press('Alt+Meta+ArrowLeft')
    await expect(window.locator('.pane.focused').getByTestId('editor-surface')).toBeVisible()
    await window.keyboard.press('Alt+Meta+ArrowRight')
    await expect(window.locator('.pane.focused').getByTestId('browser-surface')).toBeVisible()

    // ⌃⌘← moves the browser tab into the left pane; the right pane collapses,
    // leaving a single pane with all three tabs.
    await window.keyboard.press('Control+Meta+ArrowLeft')
    await expect(window.getByTestId('pane')).toHaveCount(1)
    await expect(window.getByTestId('pane-tab')).toHaveCount(3)
    await expect(window.getByTestId('browser-surface')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('clicking a pane surface (not its tab bar) focuses that pane', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    await createWorkspace(window, 'e2e-s5-click')

    // ⌘D → picker → Editor: terminal | editor, with the editor pane focused.
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('editor-surface')).toBeVisible()
    await expect(window.locator('.pane.focused').getByTestId('editor-surface')).toBeVisible()

    // Click inside the terminal *surface* itself — focus follows even though the
    // surface is portaled in by SurfaceHost (not a child of the pane in React).
    await window.getByTestId('terminal-surface').click()
    await expect(window.locator('.pane.focused').getByTestId('terminal-surface')).toBeVisible()
    await expect(window.locator('.pane.focused').getByTestId('editor-surface')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
