import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';
import { PATHS } from '../src/routes/paths';

async function mockDashboardState(page: Page) {
  const state: Record<string, Record<string, unknown>> = {};
  await mockAuthenticatedBackend(page, {
    '/api/v1/settings/work-state': async (route) => {
      if (route.request().method() === 'PUT') {
        const { key, value } = route.request().postDataJSON();
        state[key] = value;
      }
      await route.fulfill({ status: 200, json: { version: 1, state } });
    },
  });
  return state;
}

test('dashboard search and authorization summary stay usable at supported widths', async ({ page }, testInfo) => {
  const state = await mockDashboardState(page);
  state.navigation = { dashboardPinnedCardIds: ['ffmpeg_generator_card', 'video_drafts'] };
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Toolbox 控制台' })).toBeVisible();
    const details = page.locator('#dashboard-status-details');
    if (width < 768) {
      await expect(details).toBeHidden();
      await page.getByRole('button', { name: '展開登入與授權狀態' }).click();
      await expect(details).toBeVisible();
      await page.getByRole('button', { name: '收合登入與授權狀態' }).click();
    } else {
      await expect(details).toBeVisible();
    }

    const favorites = page.getByRole('region', { name: '常用工具' });
    await expect(favorites.getByRole('link', { name: 'FFmpeg 命令行生成器' })).toBeVisible();
    await expect(favorites.getByRole('link', { name: 'Video 草稿 尚缺授權' })).toHaveAttribute(
      'href',
      PATHS.youtubeVideoDrafts
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-shortcuts-${width}.png`), animations: 'disabled' });

    const search = page.getByRole('searchbox', { name: '搜尋工具' });
    await search.fill('  ffmpeg  ');
    await expect(page.locator('.feature-card')).toHaveCount(1);
    await expect(page.getByRole('link', { name: '進入生成器' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-search-${width}.png`), animations: 'disabled' });
    await search.fill('無此功能');
    await expect(page.getByText('找不到符合的工具')).toBeVisible();
    await page.getByRole('button', { name: '顯示全部工具' }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByRole('link', { name: '進入 Video 草稿' })).toBeVisible();
  }
});

test('dashboard shortcuts survive tool visits, sidebar saves and a refresh', async ({ page }) => {
  const state = await mockDashboardState(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/dashboard');

  const pin = page.getByRole('button', { name: '將 FFmpeg 命令行生成器 加入常用工具' });
  await pin.focus();
  await page.keyboard.press('Enter');
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  const favorites = page.getByRole('region', { name: '常用工具' });
  await expect(favorites.getByRole('link', { name: 'FFmpeg 命令行生成器' })).toBeVisible();
  await page.getByRole('button', { name: '收起側邊選單' }).click();
  await expect.poll(() => state.navigation?.sidebarCollapsed).toBe(true);
  expect(state.navigation.dashboardPinnedCardIds).toEqual(['ffmpeg_generator_card']);

  await favorites.getByRole('link', { name: 'FFmpeg 命令行生成器' }).click();
  await expect(page).toHaveURL(/\/ffmpeg-generator$/);
  await expect.poll(() => state.navigation?.dashboardRecentCardIds).toEqual(['ffmpeg_generator_card']);
  await page.goto('/dashboard');
  await expect(favorites.getByRole('link', { name: 'FFmpeg 命令行生成器' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: '最近使用' }).getByRole('link', { name: 'FFmpeg 命令行生成器' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '展開側邊選單' })).toBeVisible();
});
