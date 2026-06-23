import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

// M-J1-S3 + S4: from the single terminal pane, ⌘D opens the surface picker;
// choosing Editor splits vertically into an editor pane (P-split-v, AC1.2). The
// editor opens as a scratch buffer (no file required); ⌘S runs Save As to write
// it to a host file (AC2.2), and ⌘O opens an existing host file into the buffer.
//
// The native save/open dialogs are stubbed in the main process.
test('vertical split → scratch editor → Save As, then ⌘O opens a file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tessera-e2e-editor-'))
  const savePath = join(dir, 'note.txt')
  const openPath = join(dir, 'existing.ts')
  await writeFile(openPath, 'export const OPENED = 42\n', 'utf8')

  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    // Stub the host save/open dialogs to fixed paths.
    await app.evaluate(({ dialog }, paths) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: paths.savePath
      })) as typeof dialog.showSaveDialog
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [paths.openPath]
      })) as typeof dialog.showOpenDialog
    }, { savePath, openPath })

    const window = await app.firstWindow()

    // Create a host workspace rooted at our temp dir.
    await expect(window.getByTestId('empty-state')).toBeVisible()
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-name').fill('e2e-edit')
    await window.getByTestId('ws-cwd').fill(dir)
    await window.getByTestId('ws-create').click()

    await expect(window.getByTestId('terminal-surface')).toBeVisible()
    await expect(window.locator('.surface > .col')).toHaveCount(1)

    // ⌘D (Cmd only) → surface picker → choose Editor → vertical split into a
    // scratch editor (no file dialog).
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    const editor = window.getByTestId('editor-surface')
    await expect(editor).toBeVisible()
    await expect(window.locator('.surface > .col')).toHaveCount(2)
    // Starts as scratch: the hint pill shows, no breadcrumb yet.
    await expect(window.getByTestId('scratch-open')).toBeVisible()
    await expect(window.locator('.crumb')).toHaveCount(0)

    // Type into the scratch buffer; the hint disappears once it has content.
    await editor.locator('.cm-editor').click()
    await window.keyboard.type('scratch note 42')
    await expect(window.getByTestId('scratch-open')).toHaveCount(0)

    // ⌘S → Save As writes the buffer to the host file and binds the tab.
    await window.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => readFile(savePath, 'utf8'), { timeout: 15_000 })
      .toContain('scratch note 42')
    await expect(window.locator('.crumb')).toContainText('e2e-edit')

    // ⌘O → open an existing host file into the editor.
    await window.keyboard.press('ControlOrMeta+o')
    await expect(editor).toContainText('OPENED', { timeout: 15_000 })
  } finally {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  }
})
