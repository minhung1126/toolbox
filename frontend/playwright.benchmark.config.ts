import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig(base, {
  testIgnore: [],
  testMatch: '**/*.benchmark.spec.ts',
  fullyParallel: false,
  workers: 1,
  outputDir: './test-results/benchmarks',
});
