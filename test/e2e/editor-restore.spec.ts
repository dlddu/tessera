import { test, expect, type Page } from '@playwright/test'
import { freshUserDataDir, launchApp } from './helpers'

// AC4.1 (T-4 scenario 1): an editor's unsaved buffer survives a restart. Type
// into a scratch editor, let the content-triggered autosave persist it, quit,
// relaunch against the SAME userData, and prove the buffer is restored. The
// window/pane/tab skeleton restore itself is covered by M-J1-S6; here we assert
// the editor *content* that M-J1-S6 explicitly leaves to J4/PRD-4. Cursor /
// selection round-tripping is covered by the unit test (editor-restore.test.ts).

const UNSAVED = 'const answer = 42 // unsaved edit'

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

test('restores an editor’s unsaved buffer after a restart (AC4.1)', async () => {
  const userDataDir = freshUserDataDir()

  // ---- First launch: type unsaved text into a scratch editor, let it save. ----
  const first = await launchApp(userDataDir)
  try {
    const window = await first.firstWindow()
    await createWorkspace(window, 'e2e-ac41')

    // ⌘D → picker → Editor: split into a scratch editor pane (focus follows it).
    await window.keyboard.press('Meta+d')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    const editor = window.getByTestId('editor-surface')
    await expect(editor).toBeVisible()

    // Type into the scratch buffer — never saved to a file, so it can only
    // survive via the persisted `surfaces` content, not a file re-read.
    await editor.locator('.cm-editor').click()
    await window.keyboard.type(UNSAVED)
    await expect(editor).toContainText(UNSAVED)

    // Editing triggers the debounced autosave; the "saved ✓" toast confirms the
    // buffer landed on disk before we quit.
    await expect(window.getByTestId('layout-saved-toast')).toBeVisible()
  } finally {
    await first.close()
  }

  // ---- Second launch: same userData → the unsaved buffer is restored. ----
  const second = await launchApp(userDataDir)
  try {
    const window = await second.firstWindow()

    // No empty state — we boot straight into the restored workspace.
    await expect(window.getByTestId('empty-state')).toHaveCount(0)
    const editor = window.getByTestId('editor-surface')
    await expect(editor).toBeVisible()
    await expect(editor).toContainText(UNSAVED)
  } finally {
    await second.close()
  }
})
