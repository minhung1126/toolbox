import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend, toolCatalog } from './fixtures';

const dashboardCardCount = toolCatalog.reduce((count, tool) => count + tool.routes.length, 0);

async function waitForVisualFonts(page: import('@playwright/test').Page) {
  if (process.platform === 'linux') {
    await page.addStyleTag({ content: ":root { --font-sans: 'Noto Sans CJK TC', sans-serif; }" });
  }
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [390, 768, 1440]) {
  test(`shared controls and keyboard focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAuthenticatedBackend(page);
    await page.goto('/system/design-system');
    await expect(page.getByRole('heading', { name: '共用元件展示' })).toBeVisible();
    await waitForVisualFonts(page);
    await expect(page).toHaveScreenshot(`showcase-${width}.png`, { animations: 'disabled', fullPage: true });
    await page.getByRole('button', { name: '主要操作', exact: true }).focus();
    await expect(page).toHaveScreenshot(`showcase-focus-${width}.png`, { animations: 'disabled', fullPage: true });
  });

  test(`dashboard and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAuthenticatedBackend(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Toolbox 控制台' })).toBeVisible();
    // The heading renders before the catalog and saved navigation have hydrated.
    await expect(
      page.getByText(`顯示 ${dashboardCardCount} / ${dashboardCardCount} 個工具入口`, { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '將 FFmpeg 命令行生成器 加入常用工具', exact: true })).toBeEnabled();
    await expect(page.getByText('按工具卡右上角的圖釘，即可加入常用入口。', { exact: true })).toBeVisible();
    await waitForVisualFonts(page);
    await expect(page).toHaveScreenshot(`dashboard-${width}.png`, {
      animations: 'disabled',
      fullPage: true,
      // Edge rasterizes a few card icons differently across Windows hosts.
      maxDiffPixels: process.platform === 'win32' ? 20 : 0,
    });
  });
}
