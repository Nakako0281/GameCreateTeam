import { defineConfig } from '@playwright/test'

process.env.ASTRO_OUT_DIR = process.env.ASTRO_OUT_DIR || 'dist-ads'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/ads-leakage.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4322',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node node_modules/astro/bin/astro.mjs preview --port 4322 --host 127.0.0.1',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: false,
    timeout: 30000,
    stderr: 'pipe',
  },
})
