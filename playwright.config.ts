import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Each test launches its own browser profile with the extension loaded.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-fixtures.mjs 4173',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
