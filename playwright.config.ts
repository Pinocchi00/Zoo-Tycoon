import { defineConfig, devices } from '@playwright/test';

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${String(PREVIEW_PORT)}`;
const isCi = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: isCi,
  retries: 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: PREVIEW_URL,
    trace: 'retain-on-failure',
    // Same software WebGL on every machine: the default backend logs driver warnings
    // ("GPU stall due to ReadPixels") that the boot test rightly refuses.
    launchOptions: { args: ['--use-angle=swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Tests run against the production build: it is what players get.
  webServer: {
    command: `npm run preview -- --port ${String(PREVIEW_PORT)} --strictPort`,
    url: PREVIEW_URL,
    reuseExistingServer: !isCi,
  },
});
