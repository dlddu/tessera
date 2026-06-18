import { resolve } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

// Smoke e2e: the app boots into the empty (no-workspace) state and the status
// bar shows the "워크스페이스 없음" prompt. Requires `npm run build` first —
// launches the bundled main entry.
test('app launches and shows the empty-state status bar', async () => {
  const app = await electron.launch({ args: [resolve('out/main/index.js')] })

  try {
    const window = await app.firstWindow()
    const statusbar = window.getByTestId('statusbar')

    await expect(statusbar).toBeVisible()
    await expect(statusbar).toContainText('워크스페이스 없음')
    await expect(window.getByTestId('empty-state')).toBeVisible()
  } finally {
    await app.close()
  }
})
