import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/monad',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/monad/setup.ts',
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  outputDir: 'test-results/monad',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/monad', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8090',
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    serviceWorkers: 'block'
  },
  webServer: {
    command: 'node node_modules/http-server/bin/http-server dist/apps/remix-ide -a 127.0.0.1 -p 8090 -c-1',
    url: 'http://127.0.0.1:8090',
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [{ name: 'chromium' }]
})
