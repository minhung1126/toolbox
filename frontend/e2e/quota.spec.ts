import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

test('quota health supports refresh, failure recovery and responsive shared controls', async ({ page }, testInfo) => {
  let fail = false;
  await mockAuthenticatedBackend(page, {
    '/api/v1/youtube/quota-usage': async (route) => {
      await route.fulfill({
        status: fail ? 503 : 200,
        json: fail
          ? { detail: { code: 'quota_unavailable', message: '配額暫時無法讀取', retryable: true } }
          : {
              state: 'normal',
              slot: 'primary',
              configured_project_limit: 10000,
              estimated_used_units: 2000,
              effective_available_units: 7000,
              policy_cap_units: 9000,
              safety_buffer_units: 1000,
              updated_at: '2026-09-25T00:00:00Z',
            },
      });
    },
  });

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/system/health');
    await expect(page.getByRole('heading', { name: 'API 健康度', exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: '配額使用比例' })).toHaveAttribute('aria-valuenow', '20');
    await page.getByRole('button', { name: '全部更新', exact: true }).click();
    await expect(page.getByText(/系統可用 7,000 單位/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`quota-${width}.png`), fullPage: true });
  }

  fail = true;
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await expect(page.getByText('配額暫時無法讀取')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: '重試', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '配額使用比例' })).toBeVisible();
});
