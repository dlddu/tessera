import { defineConfig } from '@playwright/test'

// e2e drives the built Electron app via Playwright's `_electron` API.
// Requires `npm run build` first (launches ./out/main/index.js).
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 }
})
