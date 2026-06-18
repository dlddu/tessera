import { resolve } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

// Smoke e2e: the app boots and the status bar (with the workspace name) shows.
// Requires `npm run build` first — launches the bundled main entry.
test('app launches and shows the status bar', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    const statusbar = window.getByTestId('statusbar')

    await expect(statusbar).toBeVisible()
    await expect(statusbar).toContainText('tessera')
  } finally {
    await app.close()
  }
})
