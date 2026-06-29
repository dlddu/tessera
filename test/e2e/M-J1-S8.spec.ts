import { test, expect, type Page } from '@playwright/test'
import { freshUserDataDir, launchApp } from './helpers'

// M-J1-S8: workspace list + switching with state preservation (AC1.7). A single
// window shows a left rail (C-workspace-rail) listing every workspace; clicking a
// row — or pressing ⌘/Ctrl+its number — makes it the visible one. Every
// workspace stays mounted (keep-alive), so a switched-away workspace keeps its
// whole pane/tab tree (and its live surfaces) and is restored exactly on return.
//
// The headline properties asserted here:
//  - both mouse (rail click) and keyboard (⌘+number) switch the active workspace;
//  - switching is display-only: exactly one workspace surface is ever visible,
//    while both stay in the DOM (never tiled side by side);
//  - an inactive workspace's layout *and* live state survive — A's mosaic and a
//    marker typed into A's shell are intact after a detour through B.

/** The single currently-visible workspace surface (inactive ones are hidden). */
function activeSurface(window: Page) {
  return window.locator('[data-testid="workspace-surface"][data-active="true"]')
}

/** Open the create dialog via `open`, fill it for a host workspace, create. */
async function createWorkspace(window: Page, open: () => Promise<void>, name: string) {
  await open()
  await expect(window.getByTestId('workspace-dialog')).toBeVisible()
  await window.getByTestId('ws-name').fill(name)
  await window.getByTestId('ws-cwd').fill(process.cwd())
  await window.getByTestId('ws-create').click()
  await expect(window.getByTestId('workspace-dialog')).toHaveCount(0)
}

test('switches workspaces by mouse and keyboard, preserving each layout and state (AC1.7)', async () => {
  const app = await launchApp(freshUserDataDir())

  try {
    const window = await app.firstWindow()

    // ---- Workspace A: created from the empty-state (⌘N), then split. ----
    await expect(window.getByTestId('empty-state')).toBeVisible()
    await createWorkspace(window, () => window.keyboard.press('ControlOrMeta+n'), 'e2e-s8-a')

    // A starts as a single terminal pane; ⌘D → Editor splits it into two panes.
    await expect(activeSurface(window).getByTestId('pane')).toHaveCount(1)
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(activeSurface(window).getByTestId('editor-surface')).toBeVisible()
    await expect(activeSurface(window).getByTestId('pane')).toHaveCount(2)

    // Round-trip a marker through A's live shell, so we can later prove A's PTY
    // (and scrollback) survives being hidden while B is the visible workspace.
    const aTerminal = activeSurface(window).getByTestId('terminal-surface')
    const aRows = activeSurface(window).locator('.term-surface .xterm-rows')
    await expect
      .poll(async () => (await aRows.innerText()).trim().length, { timeout: 15_000 })
      .toBeGreaterThan(0)
    const marker = `WS_A_${Date.now()}`
    await aTerminal.click()
    await window.keyboard.type(`echo ${marker}`)
    await window.keyboard.press('Enter')
    await expect(aRows).toContainText(marker, { timeout: 15_000 })

    // ---- Workspace B: created from the rail's "new" button; a single pane. ----
    await createWorkspace(
      window,
      () => window.getByTestId('workspace-rail-new').click(),
      'e2e-s8-b'
    )

    // B is now active. The rail lists both, newest-first — so B is ⌘1, A is ⌘2 —
    // and B shows a single pane.
    await expect(window.getByTestId('workspace-rail')).toBeVisible()
    await expect(window.getByTestId('workspace-rail-item-0')).toContainText('e2e-s8-b')
    await expect(window.getByTestId('workspace-rail-item-1')).toContainText('e2e-s8-a')
    await expect(window.getByTestId('workspace-rail-item-0')).toHaveClass(/active/)
    await expect(activeSurface(window).getByTestId('pane')).toHaveCount(1)

    // Both workspaces are mounted (keep-alive) but only one surface is shown —
    // the two windows are never tiled side by side.
    await expect(window.locator('[data-testid="workspace-surface"]')).toHaveCount(2)
    await expect(window.locator('[data-testid="workspace-surface"]:not([hidden])')).toHaveCount(1)

    // ---- Switch to A by MOUSE: click its rail row → A's two-pane mosaic shows. ----
    await window.getByTestId('workspace-rail-item-1').click()
    await expect(window.getByTestId('workspace-rail-item-1')).toHaveClass(/active/)
    await expect(activeSurface(window).getByTestId('pane')).toHaveCount(2)
    // A's terminal — hidden while B was shown — still carries the pre-switch marker.
    await expect(activeSurface(window).locator('.term-surface .xterm-rows')).toContainText(marker)
    // Still exactly one surface visible after the switch.
    await expect(window.locator('[data-testid="workspace-surface"]:not([hidden])')).toHaveCount(1)

    // ---- Manipulate A: ⌘D → Browser adds a third pane (now A ≠ its prior shape). ----
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-browser').click()
    await expect(activeSurface(window).getByTestId('pane')).toHaveCount(3)

    // ---- Switch to B by KEYBOARD (⌘1): B's single pane, untouched. ----
    await window.keyboard.press('Meta+1')
    await expect(window.getByTestId('workspace-rail-item-0')).toHaveClass(/active/)
    await expect(activeSurface(window).getByTestId('pane')).toHaveCount(1)

    // ---- Back to A by KEYBOARD (⌘2): A's three-pane mosaic + marker fully restored. ----
    await window.keyboard.press('Meta+2')
    await expect(window.getByTestId('workspace-rail-item-1')).toHaveClass(/active/)
    await expect(activeSurface(window).getByTestId('pane')).toHaveCount(3)
    await expect(activeSurface(window).locator('.term-surface .xterm-rows')).toContainText(marker)
    await expect(window.locator('[data-testid="workspace-surface"]:not([hidden])')).toHaveCount(1)
  } finally {
    await app.close()
  }
})
