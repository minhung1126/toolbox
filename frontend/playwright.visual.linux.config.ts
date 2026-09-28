import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Linux Chromium uses its own reviewed snapshots and a fixed CJK font in CI.
const { webServer: _baseWebServer, ...sharedConfig } = base;

export default defineConfig(sharedConfig, {
  testIgnore: [],
  testMatch: '**/*.visual.spec.ts',
  workers: 2,
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/visual-baselines-linux/{arg}{ext}',
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4174',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
