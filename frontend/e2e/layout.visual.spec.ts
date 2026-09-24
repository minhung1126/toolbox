import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

for (const width of [390, 768, 1440]) {
  test(`shared controls and keyboard focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAuthenticatedBackend(page);
    await page.goto('/system/design-system');
    await expect(page.getByRole('heading', { name: '共用元件展示' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`showcase-${width}.png`, { animations: 'disabled', fullPage: true });
    await page.getByRole('button', { name: '主要操作', exact: true }).focus();
    await expect(page).toHaveScreenshot(`showcase-focus-${width}.png`, { animations: 'disabled', fullPage: true });
  });

  test(`dashboard and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAuthenticatedBackend(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Toolbox 控制台' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`dashboard-${width}.png`, { animations: 'disabled', fullPage: true });
  });
}
