import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 20000,
  use: {
    browserName: 'chromium',
    launchOptions: process.env.GPEEK_BROWSER_PATH
      ? { executablePath: process.env.GPEEK_BROWSER_PATH }
      : {},
  },
});
