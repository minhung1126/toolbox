import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

test('YouTube Music does not show token validation success for a malformed response', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/ytmusic/custom-token/validate': { status: 'success', valid: false },
  });

  await page.goto('/ytmusic/settings');
  await page.getByLabel(/貼上 Token 代碼/).fill('cookie: SAPISID=invalid');
  await page.getByRole('button', { name: '檢查此 Token 是否有效' }).click();

  await expect(page.getByText('Token 驗證失敗', { exact: true })).toBeVisible();
  await expect(page.getByText('Token 驗證成功', { exact: true })).toHaveCount(0);
});

test('YouTube Music does not report a preference saved after the work-state write fails', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/settings/work-state': async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          json: { detail: { code: 'work_state_unavailable', message: '暫時無法儲存' } },
        });
        return;
      }
      await route.fulfill({ status: 200, json: { version: 1, state: {} } });
    },
  });

  await page.goto('/ytmusic/settings');
  await page.getByRole('button', { name: '儲存偏好設定' }).click();

  await expect(page.getByText('偏好設定尚未確認儲存，請檢查連線後重試。')).toBeVisible();
  await expect(page.getByText('YouTube Music 偏好設定已成功儲存！')).toHaveCount(0);
});
