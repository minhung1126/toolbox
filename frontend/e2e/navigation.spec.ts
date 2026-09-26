import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend, toolCatalog } from './fixtures';

test('disabled tools disappear from navigation and reject direct deep links', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/tools': {
      tools: toolCatalog.map((tool) => (tool.id === 'sticky-notes' ? { ...tool, status: 'disabled' } : tool)),
    },
  });
  await page.goto('/dashboard');
  await expect(page.getByText('8 個工具模組已就緒')).toBeVisible();
  await expect(page.getByRole('link', { name: '便利貼' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '進入便利貼' })).toHaveCount(0);

  await page.goto('/notes');
  await expect(page.getByText('此工具目前未啟用。')).toBeVisible();
});

test('desktop collapse does not hide mobile navigation and drawer traps focus', async ({ page }) => {
  await mockAuthenticatedBackend(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: '收起側邊選單' }).click();
  await expect(page.locator('.sidebar')).toHaveClass(/is-collapsed/);
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('.sidebar')).not.toBeVisible();
  const open = page.getByRole('button', { name: '開啟導覽選單' });
  await open.click();
  const sidebar = page.getByRole('complementary', { name: '主要導覽' });
  const close = sidebar.getByRole('button', { name: '關閉導覽選單' });
  const logout = sidebar.getByRole('button', { name: '登出控制台' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(logout).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await expect(sidebar.locator('a[href="/notes"] span')).toBeVisible();
  // A normal click must reach the link rather than be intercepted by the backdrop.
  await sidebar.locator('a[href="/notes"]').click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(sidebar).not.toBeVisible();
  await open.click();
  await page.keyboard.press('Escape');
  await expect(sidebar).not.toBeVisible();
  await expect(open).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('button', { name: '展開側邊選單' })).toBeVisible();
});
