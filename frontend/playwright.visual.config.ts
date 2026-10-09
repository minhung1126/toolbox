import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Baselines are reviewed on Windows + Edge. Keep other platforms explicit:
// generating snapshots on CI would silently accept a visual regression.
if (process.platform !== 'win32') throw new Error('Visual baselines require Windows and Microsoft Edge.');

// defineConfig concatenates webServer entries; visual tests need only their own server.
const { webServer: _baseWebServer, use: baseUse, ...sharedConfig } = base;
// The Edge baseline must not inherit a custom E2E executable or browser channel.
const { channel: _baseChannel, launchOptions: _baseLaunchOptions, ...sharedUse } = baseUse ?? {};

export default defineConfig(sharedConfig, {
  testIgnore: [],
  testMatch: '**/*.visual.spec.ts',
  workers: 2,
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  use: {
    ...sharedUse,
    channel: 'msedge',
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
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
