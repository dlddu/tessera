import { resolve } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

// Full create flow: empty state → ⌘N → fill the dialog → create → single-pane
// surface with the new workspace name. The native folder picker is bypassed by
// typing the directory directly (picker button is verified manually).
test('creates a host workspace from the dialog', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    // ⌘N (Control+N on Linux/Windows) opens the creation dialog.
    await window.keyboard.press('ControlOrMeta+n')
    const dialog = window.getByTestId('workspace-dialog')
    await expect(dialog).toBeVisible()

    // Create button is disabled until name + cwd are filled.
    const create = window.getByTestId('ws-create')
    await expect(create).toBeDisabled()

    await window.getByTestId('ws-name').fill('e2e-proj')
    // A directory that is guaranteed to exist on the host (the repo root).
    await window.getByTestId('ws-cwd').fill(process.cwd())
    await expect(create).toBeEnabled()

    await create.click()

    // Dialog closes and the single-pane surface shows the new workspace name.
    await expect(dialog).toBeHidden()
    const statusbar = window.getByTestId('statusbar')
    await expect(statusbar).toContainText('e2e-proj')
    await expect(window.getByTestId('empty-state')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

// Enter from a filled field creates the workspace without touching the button,
// so the primary action is reachable with a single keystroke.
test('creates a host workspace by pressing Enter in a field', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    await window.keyboard.press('ControlOrMeta+n')
    const dialog = window.getByTestId('workspace-dialog')
    await expect(dialog).toBeVisible()

    await window.getByTestId('ws-name').fill('enter-proj')
    await window.getByTestId('ws-cwd').fill(process.cwd())

    // Submit straight from the name field — no click on "워크스페이스 생성".
    await window.getByTestId('ws-name').focus()
    await window.keyboard.press('Enter')

    await expect(dialog).toBeHidden()
    const statusbar = window.getByTestId('statusbar')
    await expect(statusbar).toContainText('enter-proj')
    await expect(window.getByTestId('empty-state')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
