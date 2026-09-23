import { expect, test } from '@playwright/test';

async function mockAuthenticatedBackend(page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/v1/auth/user': {
        authenticated: true,
        user: { sub: 'design-system-e2e', email: 'design-system@example.test' },
        authorizations: {
          sheets: { connected: false },
          ytmusic: { connected: false },
          video_uploader: { connected: false },
        },
        google_scopes: {},
        youtube: { slots: {} },
      },
      '/api/v1/settings/system': {},
      '/api/v1/settings/shared': {},
      '/api/v1/settings/youtube': {},
      '/api/v1/settings/team-person-filter': {},
      '/api/v1/settings/work-state': { state: {} },
      '/api/v1/health': { commit_sha: 'development' },
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responses[path] ?? {}),
    });
  });
}

test('component showcase stays readable without horizontal overflow on supported widths', async ({
  page,
}, testInfo) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/system/design-system');
    await expect(page.getByRole('heading', { level: 1, name: '共用元件展示' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '按鈕與互動狀態' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`component-showcase-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('sheet copy feature styles load and stay within supported viewport widths', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/sheets/copy');
    await expect(page.getByRole('heading', { level: 1, name: 'Sheet 內容複製' })).toBeVisible();

    const optionsPadding = await page
      .locator('.sheet-copy-page-options')
      .evaluate((element) => getComputedStyle(element).padding);
    expect(optionsPadding, `feature styles did not load at ${width}px`).toBe('12px 16px');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('sticky notes feature styles load without viewport overflow', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/notes');
    await expect(page.getByRole('heading', { level: 1, name: '便利貼備忘錄' })).toBeVisible();

    const searchInput = page.getByRole('textbox', { name: '搜尋便利貼' });
    await expect(searchInput).toBeVisible();
    const padding = await searchInput.evaluate((element) => getComputedStyle(element).padding);
    expect(padding, `feature styles did not load at ${width}px`).toBe('8.8px 32px 8.8px 35.2px');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('photo curator feature styles keep the workbench within supported viewport widths', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/photo-curator');
    await expect(page.getByRole('heading', { level: 1, name: '貼文三部曲排版工作台' })).toBeVisible();
    await expect(page.locator('.curator-workbench-grid')).toHaveCSS('display', 'grid');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('FFmpeg feature styles switch to a single-column workbench on narrow screens', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/ffmpeg-generator');
    await expect(page.getByRole('heading', { level: 1, name: 'FFmpeg 命令行生成器' })).toBeVisible();

    const gridColumns = await page
      .locator('.ffmpeg-workbench-layout')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
    expect(gridColumns, `unexpected workbench column count at ${width}px`).toBe(width <= 1024 ? 1 : 2);

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      elements: Array.from(document.body.querySelectorAll('*'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            right: Math.round(rect.right),
          };
        })
        .filter((element) => element.right > window.innerWidth + 1)
        .sort((left, right) => right.right - left.right)
        .slice(0, 8),
    }));
    expect(
      layout.overflow,
      `horizontal overflow at ${width}px: ${JSON.stringify(layout.elements)}`
    ).toBeLessThanOrEqual(1);
  }
});

test('publish cleaner feature styles align source controls for mobile and desktop', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/youtube/publish-cleanup');
    await expect(page.getByRole('heading', { level: 1, name: '發布 YouTube 草稿' })).toBeVisible();

    const sourceAlignment = await page
      .locator('.publish-source-panel')
      .evaluate((element) => getComputedStyle(element).alignItems);
    expect(sourceAlignment, `publish feature styles did not load at ${width}px`).toBe(
      width < 768 ? 'stretch' : 'flex-end'
    );

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('YouTube batch feature styles load without viewport overflow', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/youtube/drafts/videos');
    await expect(page.getByRole('heading', { level: 1, name: 'YouTube Video 草稿' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /試算表隨機抽查/ })).toHaveCSS('display', 'flex');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('Weverse folder picker styles stay usable across viewport widths', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/weverse-uploader');
    await expect(page.getByRole('heading', { level: 1, name: /Weverse 影片與字幕上傳/ })).toBeVisible();

    const dropzonePadding = await page
      .locator('.weverse-dropzone')
      .evaluate((element) => getComputedStyle(element).padding);
    expect(dropzonePadding, `Weverse styles did not load at ${width}px`).toBe(width <= 640 ? '32px 16px' : '48px 32px');

    const dropzone = page.locator('.weverse-dropzone');
    await dropzone.dispatchEvent('dragover');
    await expect(dropzone).toHaveClass(/is-dragging/);
    await expect(dropzone).toHaveCSS('border-color', 'rgb(99, 102, 241)');
    await dropzone.dispatchEvent('dragleave');

    await page.getByRole('button', { name: '直接輸入本機路徑' }).click();
    const pathDirection = await page
      .locator('.weverse-manual-path-row')
      .evaluate((element) => getComputedStyle(element).flexDirection);
    expect(pathDirection, `manual path controls did not adapt at ${width}px`).toBe(width <= 640 ? 'column' : 'row');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});
