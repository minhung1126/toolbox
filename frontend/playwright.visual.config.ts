import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Baselines are reviewed on Windows + Edge. Keep other platforms explicit:
// generating snapshots on CI would silently accept a visual regression.
if (process.platform !== 'win32') throw new Error('Visual baselines require Windows and Microsoft Edge.');

// defineConfig concatenates webServer entries; visual tests need only their own server.
const { webServer: _baseWebServer, use: baseUse, ...sharedConfig } = base;
// The Edge baseline must not inherit a custom E2E executable or browser channel.
const { channel: _baseChannel, launchOptions: _baseLaunchOptions, ...sharedUse } = baseUse ?? {};
const port = Number(process.env.PLAYWRIGHT_EDGE_VISUAL_PORT || 4174);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig(sharedConfig, {
  testIgnore: [],
  testMatch: '**/*.visual.spec.ts',
  workers: 2,
  outputDir: './test-results/visual-edge',
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  use: {
    ...sharedUse,
    channel: 'msedge',
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
