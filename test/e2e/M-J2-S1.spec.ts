import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * M-J2-S1 (AC2.1): create a container-machine workspace end-to-end.
 *
 * Empty state → ⌘N → dialog → pick the 컨테이너 backend → fill image + home-mount
 * → create → single-pane surface with the new name and a "container" backend
 * badge. Creating actually stands up a real Apple `container` machine (create +
 * boot to running), which needs macOS 26 + Apple Silicon and the `container`
 * CLI — stock GitHub-hosted runners can't nest virtualization, so this spec is
 * NON-GATING and runs only when `TESSERA_CONTAINER_E2E=1` (a self-hosted Mac or
 * a local dev machine). It's skipped everywhere else so `npm run test:e2e`
 * stays green.
 */
test.skip(
  !process.env['TESSERA_CONTAINER_E2E'],
  'requires a real Apple `container` runtime (set TESSERA_CONTAINER_E2E=1)'
)

// A machine image that ships an init (e.g. /sbin/init); plain `ubuntu` lacks one
// and the machine won't boot. Override via env for local experimentation.
const IMAGE = process.env['TESSERA_CONTAINER_IMAGE'] ?? 'ghcr.io/apple/container/init:latest'

test('creates a container-machine workspace from the dialog', async () => {
  const app = await launchApp()

  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('empty-state')).toBeVisible()

    await window.keyboard.press('ControlOrMeta+n')
    const dialog = window.getByTestId('workspace-dialog')
    await expect(dialog).toBeVisible()

    // Switch to the container backend; the image + home-mount fields appear.
    await window.getByTestId('ws-backend-container').click()
    const create = window.getByTestId('ws-create')
    // No image yet → create is disabled.
    await expect(create).toBeDisabled()

    await window.getByTestId('ws-name').fill('cont-proj')
    await window.getByTestId('ws-image').fill(IMAGE)
    await window.getByTestId('ws-homemount-rw').click()
    await expect(create).toBeEnabled()

    await create.click()

    // Dialog closes once the machine is created + booted; the surface shows the
    // new workspace name and the backend badge reads "container".
    await expect(dialog).toBeHidden({ timeout: 120_000 })
    await expect(window.getByTestId('empty-state')).toHaveCount(0)
    const statusbar = window.getByTestId('statusbar')
    await expect(statusbar).toContainText('cont-proj')
    await expect(statusbar).toContainText('container')
  } finally {
    await app.close()
  }
})
