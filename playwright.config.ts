import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for end-to-end tests against the QubitLab Worker.
 *
 * Run the local Worker first:
 *   npm run dev:worker
 *
 * Then run the tests:
 *   npx playwright test
 *
 * Override the base URL:
 *   QUBITLAB_BASE_URL=https://qubitlab.dev npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.QUBITLAB_BASE_URL ?? 'http://localhost:8787',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
