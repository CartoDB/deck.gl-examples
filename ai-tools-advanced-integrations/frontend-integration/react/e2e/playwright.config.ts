import { defineConfig, devices } from 'playwright/test';

const backend = process.env.BACKEND_SDK || 'openai-agents-sdk';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  timeout: 120_000,

  expect: {
    timeout: 60_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.3,
    },
  },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'npm run dev',
      cwd: `../../../backend-integration/${backend}`,
      port: 3003,
      reuseExistingServer: true,
      timeout: process.env.CI ? 60_000 : 30_000,
      stdout: 'pipe',
    },
    {
      command: 'pnpm dev',
      cwd: '..',
      port: 5173,
      reuseExistingServer: true,
      timeout: process.env.CI ? 60_000 : 30_000,
      stdout: 'pipe',
    },
  ],

  snapshotDir: './screenshots',
  outputDir: './test-results',
});
