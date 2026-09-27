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
