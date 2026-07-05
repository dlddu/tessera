import { test, expect, type Page } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * M-J2-S5 (AC2.5): a container workspace is operated with the *same* shortcuts
 * and UI as a host one — no new operations to learn. Two things are proven:
 *
 *   1. The ⌘K command palette (this journey's new surface) opens over a live
 *      layout, filters the shared command registry, and runs the chosen command
 *      — driving the layout exactly as the keys do. (Non-gating: needs only the
 *      built app, like the rest of the layout e2e.)
 *   2. Host / container parity: the identical shortcut + palette sequence lands
 *      the same window/pane/tab layout on both backends. This half stands up a
 *      real Apple `container` machine (macOS 26 + Apple Silicon + the `container`
 *      CLI), so — like M-J2-S1..S4 — it is GATED behind `TESSERA_CONTAINER_E2E=1`
 *      and skipped everywhere else so `npm run test:e2e` stays green.
 *
 * The structural half of parity (operations are backend-agnostic, so the layouts
 * must match) is proven cheaply and CI-green by `test/unit/command-parity.test`;
 * this spec is the end-to-end witness on a real container.
 */

/** Panes/tabs/surfaces inside the single *visible* (active) workspace. */
const VISIBLE = '[data-testid="workspace-surface"]:not([hidden])'

/** Empty state → ⌘N → create a host workspace rooted at the repo dir. */
async function createHostWorkspace(window: Page, name: string) {
  await window.keyboard.press('ControlOrMeta+n')
  await expect(window.getByTestId('workspace-dialog')).toBeVisible()
  await window.getByTestId('ws-name').fill(name)
  await window.getByTestId('ws-cwd').fill(process.cwd())
  await window.getByTestId('ws-create').click()
  await expect(window.getByTestId('workspace-dialog')).toBeHidden()
}

/** ⌘N → create a container-machine workspace (create + boot to running). */
async function createContainerWorkspace(window: Page, name: string, image: string) {
  await window.keyboard.press('ControlOrMeta+n')
  await expect(window.getByTestId('workspace-dialog')).toBeVisible()
  await window.getByTestId('ws-backend-container').click()
  await window.getByTestId('ws-name').fill(name)
  await window.getByTestId('ws-image').fill(image)
  await window.getByTestId('ws-homemount-rw').click()
  await window.getByTestId('ws-create').click()
  await expect(window.getByTestId('workspace-dialog')).toBeHidden({ timeout: 120_000 })
}

/**
 * The parity sequence, run against whichever workspace is active: split with the
 * ⌘D keymap, then add a tab through the ⌘K *palette* (search → Enter → picker).
 * Ends with two panes and two tabs in the (focused) split pane — asserted by the
 * caller so host and container are held to the very same concrete result.
 */
async function splitThenAddTabViaPalette(window: Page) {
  // ⌘D → split into an editor pane (now focused).
  await window.keyboard.press('Meta+d')
  await expect(window.getByTestId('surface-picker')).toBeVisible()
  await window.getByTestId('surface-pick-editor').click()
  await expect(window.locator(`${VISIBLE} [data-testid="editor-surface"]`)).toBeVisible()
  await expect(window.locator(`${VISIBLE} [data-testid="pane"]`)).toHaveCount(2)

  // ⌘K → palette → "새 탭" → Enter → picker → terminal: a second tab in the pane.
  await window.keyboard.press('Meta+k')
  await expect(window.getByTestId('command-palette')).toBeVisible()
  await window.getByTestId('palette-input').fill('새 탭')
  await window.keyboard.press('Enter')
  await expect(window.getByTestId('command-palette')).toHaveCount(0)
  await expect(window.getByTestId('surface-picker')).toBeVisible()
  await window.getByTestId('surface-pick-terminal').click()

  // Two panes; the focused (right) pane now carries two tabs.
  await expect(window.locator(`${VISIBLE} [data-testid="pane"]`)).toHaveCount(2)
  await expect(window.locator(`${VISIBLE} .pane.focused [data-testid="pane-tab"]`)).toHaveCount(2)
}

test('⌘K opens the command palette; search + Enter runs a layout command', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()
    await createHostWorkspace(window, 'e2e-s5-palette')
    await expect(window.getByTestId('terminal-surface')).toBeVisible()

    // ⌘K opens it, even from the focused terminal (captured before the surface).
    await window.getByTestId('terminal-surface').click()
    await window.keyboard.press('Meta+k')
    await expect(window.getByTestId('command-palette')).toBeVisible()

    // Typing filters the registry: "분할" keeps only the two split commands.
    await window.getByTestId('palette-input').fill('분할')
    await expect(window.getByTestId('palette-item')).toHaveCount(2)

    // Enter runs the top hit (수직 분할) — closes the palette and opens the picker.
    await window.keyboard.press('Enter')
    await expect(window.getByTestId('command-palette')).toHaveCount(0)
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await expect(window.getByTestId('pane')).toHaveCount(2)
    await expect(window.getByTestId('editor-surface')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the palette dismisses on Esc and on a second ⌘K, running nothing', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()
    await createHostWorkspace(window, 'e2e-s5-palette-dismiss')
    await expect(window.getByTestId('terminal-surface')).toBeVisible()

    // Esc closes it (no picker opens — nothing ran).
    await window.keyboard.press('Meta+k')
    await expect(window.getByTestId('command-palette')).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(window.getByTestId('command-palette')).toHaveCount(0)

    // A second ⌘K toggles it back shut.
    await window.keyboard.press('Meta+k')
    await expect(window.getByTestId('command-palette')).toBeVisible()
    await window.keyboard.press('Meta+k')
    await expect(window.getByTestId('command-palette')).toHaveCount(0)

    // The layout is untouched: still the single original terminal pane.
    await expect(window.getByTestId('pane')).toHaveCount(1)
    await expect(window.getByTestId('surface-picker')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('host and container reach the same layout from the same shortcuts (AC2.5)', async () => {
  test.skip(
    !process.env['TESSERA_CONTAINER_E2E'],
    'requires a real Apple `container` runtime (set TESSERA_CONTAINER_E2E=1)'
  )
  // Machine boot + several `machine run` execs far exceed the default 30s.
  test.setTimeout(300_000)

  const image = process.env['TESSERA_CONTAINER_IMAGE'] ?? 'ghcr.io/apple/container/init:latest'
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    // Host workspace: run the shortcut + palette sequence, assert the outcome.
    await createHostWorkspace(window, 'parity-host')
    await expect(window.getByTestId('terminal-surface')).toBeVisible()
    await splitThenAddTabViaPalette(window)

    // Container workspace: the *identical* sequence must reach the *identical*
    // layout — same panes, same tabs — proving no new operations are needed.
    await createContainerWorkspace(window, 'parity-cont', image)
    await expect(window.getByTestId('statusbar')).toContainText('container ·')
    await expect(window.locator(`${VISIBLE} [data-testid="terminal-surface"]`)).toBeVisible()
    await splitThenAddTabViaPalette(window)
  } finally {
    await app.close()
  }
})
