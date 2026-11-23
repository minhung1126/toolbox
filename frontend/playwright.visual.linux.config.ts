import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Linux Chromium uses its own reviewed snapshots and a fixed CJK font in CI.
const { webServer: _baseWebServer, use: baseUse, ...sharedConfig } = base;
// Visual baselines must use the lockfile's bundled browser, regardless of E2E overrides.
const { channel: _baseChannel, launchOptions: _baseLaunchOptions, ...sharedUse } = baseUse ?? {};
const port = Number(process.env.PLAYWRIGHT_LINUX_VISUAL_PORT || 4175);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig(sharedConfig, {
  testIgnore: [],
  testMatch: '**/*.visual.spec.ts',
  workers: 2,
  outputDir: './test-results/visual-linux',
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/visual-baselines-linux/{arg}{ext}',
  use: {
    ...sharedUse,
    browserName: 'chromium',
    baseURL,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js preview --mode playwright --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
