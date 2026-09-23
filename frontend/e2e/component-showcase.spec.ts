import { expect, test } from '@playwright/test';

async function mockAuthenticatedBackend(page, responseOverrides: Record<string, unknown> = {}) {
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
      '/api/v1/weverse-uploader/scan': {
        packages: [
          {
            package_id: 'sample-live',
            suggested_title: 'Sample Live',
            video: {
              filename: 'sample-live.mp4',
              full_path: 'C:\\weverse\\sample-live.mp4',
              size_formatted: '1 MB',
            },
            subtitles: [
              {
                id: 'sample-subtitle',
                filename: 'sample-live.zh_TW.vtt',
                full_path: 'C:\\weverse\\sample-live.zh_TW.vtt',
                raw_lang: 'zh_TW',
                bcp47: 'zh-TW',
                label: '繁體中文',
                size_formatted: '1 KB',
              },
            ],
          },
        ],
      },
      ...responseOverrides,
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

    await page.getByPlaceholder(/例如：D:\\Weverse/).fill('C:\\weverse\\sample');
    await page.getByRole('button', { name: '掃描並辨識' }).click();
    await expect(page.getByRole('heading', { level: 3, name: /步驟二：辨識結果複查與編輯/ })).toBeVisible();
    await expect(page.getByPlaceholder('輸入 YouTube 影片標題')).toHaveValue('Sample Live');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('Weverse upload posts the reviewed package and reaches completed state with a provider fake', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'weverse-upload-e2e', email: 'weverse-upload@example.test' },
      authorizations: {
        sheets: { connected: false },
        ytmusic: { connected: false },
        video_uploader: {
          connected: true,
          account_name: 'uploader@example.test',
          channel_title: 'Uploader Channel',
        },
      },
      google_scopes: {},
      youtube: { slots: {} },
    },
    '/api/v1/weverse-uploader/upload-from-path': { task_id: 'e2e-task-1' },
    '/api/v1/weverse-uploader/tasks/e2e-task-1': {
      task: {
        task_id: 'e2e-task-1',
        title: 'Sample Live',
        status: 'completed',
        progress_percent: 100,
        video_url: 'https://youtube.example/watch?v=e2e-video',
        studio_url: 'https://studio.youtube.example/video/e2e-video',
      },
    },
  });

  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/weverse-uploader');
  await page.getByRole('button', { name: '直接輸入本機路徑' }).click();
  await page.getByPlaceholder(/例如：D:\\Weverse/).fill('C:\\weverse\\sample');
  await page.getByRole('button', { name: '掃描並辨識' }).click();
  await expect(page.getByPlaceholder('輸入 YouTube 影片標題')).toHaveValue('Sample Live');

  const uploadRequestPromise = page.waitForRequest((request) =>
    request.url().includes('/api/v1/weverse-uploader/upload-from-path')
  );
  await page.getByRole('button', { name: '確認並開始上傳至 YouTube' }).click();
  await page.getByRole('button', { name: '立即上傳' }).click();

  const uploadRequest = await uploadRequestPromise;
  const payload = uploadRequest.postDataJSON();
  expect(payload.video_path).toBe('C:\\weverse\\sample-live.mp4');
  expect(payload.title).toBe('Sample Live');
  expect(payload.subtitles).toHaveLength(1);
  await expect(page.getByRole('heading', { level: 2, name: '上傳成功！' })).toBeVisible({ timeout: 8000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
