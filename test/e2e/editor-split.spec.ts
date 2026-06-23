import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

// M-J1-S3: from the single terminal pane, ⌘D splits vertically into an editor
// pane (P-split-v, AC1.2) that opens a host file (AC2.2), shows it with a gutter
// + syntax colors (AC1.1), and saves edits back with ⌘S.
//
// The native file picker is stubbed in the main process to return a fixed temp
// file (mirrors how workspace-create bypasses the folder picker).
test('vertical split opens a host file in the editor and saves edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tessera-e2e-editor-'))
  const filePath = join(dir, 'server.ts')
  await writeFile(filePath, 'const port = 5173\n', 'utf8')

  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    // Stub the host file picker to return our fixed file.
    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [picked]
      })) as typeof dialog.showOpenDialog
    }, filePath)

    const window = await app.firstWindow()

    // Create a host workspace rooted at our temp dir.
    await expect(window.getByTestId('empty-state')).toBeVisible()
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-name').fill('e2e-edit')
    await window.getByTestId('ws-cwd').fill(dir)
    await window.getByTestId('ws-create').click()

    // Single terminal pane first (one column).
    await expect(window.getByTestId('terminal-surface')).toBeVisible()
    await expect(window.locator('.surface > .col')).toHaveCount(1)

    // ⌘D → vertical split into an editor pane that opens the picked file.
    await window.keyboard.press('ControlOrMeta+d')

    const editor = window.getByTestId('editor-surface')
    await expect(editor).toBeVisible()
    await expect(window.locator('.surface > .col')).toHaveCount(2)

    // File content is shown, and the breadcrumb names the workspace.
    await expect(editor).toContainText('const port = 5173', { timeout: 15_000 })
    await expect(window.locator('.crumb')).toContainText('e2e-edit')

    // Edit the buffer and save it back to the host file.
    await editor.click()
    await window.keyboard.press('ControlOrMeta+a')
    await window.keyboard.type('const port = 4000\n')
    await window.keyboard.press('ControlOrMeta+s')

    await expect
      .poll(() => readFile(filePath, 'utf8'), { timeout: 15_000 })
      .toContain('const port = 4000')
  } finally {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  }
})
