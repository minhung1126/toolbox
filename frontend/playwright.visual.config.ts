import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Baselines are reviewed on Windows + Edge. Keep other platforms explicit:
// generating snapshots on CI would silently accept a visual regression.
if (process.platform !== 'win32') throw new Error('Visual baselines require Windows and Microsoft Edge.');

export default defineConfig(base, {
  testIgnore: [],
  testMatch: '**/*.visual.spec.ts',
  workers: 2,
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  use: {
    channel: 'msedge',
    baseURL: 'http://127.0.0.1:4174',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
