import { existsSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * M-J2-S3 (AC2.3): a container workspace's editor opens, edits, and saves files
 * on the *machine's* filesystem.
 *
 * Three things are proven end-to-end:
 *   1. Open — the editor's open affordance shows the container directory
 *      browser (not the host picker), seeded with the focused terminal's cwd,
 *      and picking a file loads the guest's bytes into the buffer.
 *   2. Save — ⌘S writes the edited buffer back into the machine, and Save-As on
 *      a scratch buffer writes a brand-new guest file via the browser.
 *   3. Isolation — everything above happens in the guest fs only; the host
 *      never grows the directory the test worked in.
 *
 * Like M-J2-S1/S2 this stands up a real Apple `container` machine, which needs
 * macOS 26 + Apple Silicon + the `container` CLI. Stock GitHub runners can't
 * nest virtualization, so this spec is NON-GATING: it runs only when
 * `TESSERA_CONTAINER_E2E=1` (a self-hosted Mac or local dev) and is skipped
 * everywhere else so `npm run test:e2e` stays green.
 *
 * The browser's starting directory relies on the guest shell honouring the
 * injected `PROMPT_COMMAND` OSC 7 hook (bash), exactly like M-J2-S2's cwd
 * inheritance. Point `TESSERA_CONTAINER_IMAGE` at an image whose login shell is
 * bash if the default lacks it.
 */
test.skip(
  !process.env['TESSERA_CONTAINER_E2E'],
  'requires a real Apple `container` runtime (set TESSERA_CONTAINER_E2E=1)'
)

const IMAGE = process.env['TESSERA_CONTAINER_IMAGE'] ?? 'ghcr.io/apple/container/init:latest'

/** Guest-side working directory; must NOT exist on the host (isolation check). */
const GUEST_DIR = '/tmp/tessera-s3-e2e'

/** Rows of the single *visible* terminal (inactive keep-alive slots are `hidden`). */
const VISIBLE_ROWS = '.surface-slot:not([hidden]) .xterm-rows'
/** Document of the single *visible* editor. */
const VISIBLE_EDITOR = '.surface-slot:not([hidden]) .cm-content'

test('container editor opens, edits, and saves machine files via the directory browser', async () => {
  // Machine boot + several `machine run` file roundtrips exceed the suite's
  // default 30s budget by far.
  test.setTimeout(300_000)

  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    // Create a container-machine workspace (create + boot to running).
    await window.keyboard.press('ControlOrMeta+n')
    await expect(window.getByTestId('workspace-dialog')).toBeVisible()
    await window.getByTestId('ws-backend-container').click()
    await window.getByTestId('ws-name').fill('cont-edit')
    await window.getByTestId('ws-image').fill(IMAGE)
    await window.getByTestId('ws-homemount-rw').click()
    await window.getByTestId('ws-create').click()
    await expect(window.getByTestId('workspace-dialog')).toBeHidden({ timeout: 120_000 })

    // The first pane mounts a live terminal bound to the machine's exec PTY.
    const terminal = window.getByTestId('terminal-surface')
    await expect(terminal).toBeVisible()
    const rows = window.locator(VISIBLE_ROWS)
    await expect
      .poll(async () => (await rows.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)

    // Seed a guest file and move the shell there — OSC 7 reports the cwd, which
    // becomes the browser's starting directory.
    await terminal.click()
    await window.keyboard.type(
      `mkdir -p ${GUEST_DIR} && printf 'alpha from guest\\n' > ${GUEST_DIR}/note.txt && cd ${GUEST_DIR}`
    )
    await window.keyboard.press('Enter')
    await window.keyboard.type('pwd')
    await window.keyboard.press('Enter')
    await expect(rows).toContainText(GUEST_DIR, { timeout: 15_000 })

    // (1) Open: a new editor tab's open affordance is the container browser,
    // already sitting in the terminal's directory.
    await window.keyboard.press('ControlOrMeta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    await window.getByTestId('scratch-open').click()

    const browser = window.getByTestId('container-file-browser')
    await expect(browser).toBeVisible()
    await expect(window.getByTestId('cfb-path')).toHaveText(GUEST_DIR)
    await window.getByTestId('cfb-entry-note.txt').click({ timeout: 30_000 })

    // The guest file's content lands in the buffer.
    const editor = window.locator(VISIBLE_EDITOR)
    await expect(editor).toContainText('alpha from guest', { timeout: 30_000 })

    // (2a) Save: replace the content and ⌘S back into the machine.
    await editor.click()
    await window.keyboard.press('ControlOrMeta+a')
    await window.keyboard.type('beta edited in tessera')
    await window.keyboard.press('ControlOrMeta+s')

    // (2b) Save-As: a fresh scratch buffer saves to a new guest file through
    // the browser's save mode.
    await window.keyboard.press('ControlOrMeta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-editor').click()
    const scratch = window.locator(VISIBLE_EDITOR)
    await scratch.click()
    await window.keyboard.type('gamma saved as new file')
    await window.keyboard.press('ControlOrMeta+s')
    await expect(window.getByTestId('container-file-browser')).toBeVisible()
    await expect(window.getByTestId('cfb-path')).toHaveText(GUEST_DIR)
    await window.getByTestId('cfb-filename').fill('saveas.txt')
    await window.getByTestId('cfb-save').click()

    // Both writes are visible from a fresh terminal *inside* the machine. The
    // `cat` commands don't echo the expected strings themselves, so a match
    // proves the file contents.
    await window.keyboard.press('ControlOrMeta+t')
    await expect(window.getByTestId('surface-picker')).toBeVisible()
    await window.getByTestId('surface-pick-terminal').click()
    const checkRows = window.locator(VISIBLE_ROWS)
    await expect
      .poll(async () => (await checkRows.innerText()).trim().length, { timeout: 30_000 })
      .toBeGreaterThan(0)
    await checkRows.click()
    await window.keyboard.type(`cat ${GUEST_DIR}/note.txt`)
    await window.keyboard.press('Enter')
    await expect(checkRows).toContainText('beta edited in tessera', { timeout: 15_000 })
    await window.keyboard.type(`cat ${GUEST_DIR}/saveas.txt`)
    await window.keyboard.press('Enter')
    await expect(checkRows).toContainText('gamma saved as new file', { timeout: 15_000 })

    // (3) Isolation: none of it exists on the host filesystem.
    expect(existsSync(GUEST_DIR)).toBe(false)
  } finally {
    await app.close()
  }
})
