import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

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

    const response = responses[path] ?? {};
    if (typeof response === 'function') {
      await response(route);
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
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

test('dashboard uses feature-owned styles on supported widths', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Toolbox 控制台' })).toBeVisible();
    await expect(page.locator('.dashboard-status-card').first()).toHaveCSS('background-color', 'rgb(28, 30, 36)');
    await expect(page.locator('.feature-card').first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `Dashboard horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('login and setup pages use the shared auth layout on supported widths', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': { authenticated: false },
    '/api/v1/auth/config': { has_client_id: true, has_client_secret: true },
    '/api/v1/system/setup-status': {
      is_configured: false,
      setup_completed: false,
      needs_pin: true,
      redirect_uri: 'https://toolbox.example.test/api/v1/auth/callback',
    },
  });

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Toolbox' })).toBeVisible();
    await expect(page.locator('.auth-page .login-card')).toHaveCSS('background-color', 'rgb(28, 30, 36)');

    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `login page horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);

    await page.goto('/setup');
    await expect(page.getByRole('heading', { level: 1, name: 'Toolbox 初始安裝精靈' })).toBeVisible();
    await expect(page.getByLabel(/Google OAuth Client ID/)).toBeVisible();
    await expect(page.getByLabel(/安全碼 \(PIN\)/)).toBeVisible();
    await page.getByRole('button', { name: '顯示 Client Secret' }).click();
    await expect(page.getByLabel(/Google OAuth Client Secret/)).toHaveAttribute('type', 'text');

    overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `setup page horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('system settings use feature styles and remain usable on supported widths', async ({ page }, testInfo) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/system/credentials': {
      status: 'success',
      credentials: {
        google: {
          client_id: 'settings-e2e.apps.googleusercontent.com',
          has_client_secret: true,
          client_secret_masked: 'GOCSPX****1234',
          configured: true,
        },
      },
      public_base_url: 'https://toolbox.example.test',
      redirect_uri: 'https://toolbox.example.test/api/v1/auth/callback',
    },
    '/api/v1/system/allowlist': {
      allowed_emails: ['admin@example.test', 'viewer@example.test'],
      current_user_email: 'admin@example.test',
      allow_new_users: true,
    },
  });

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/system/settings');
    await expect(page.getByRole('heading', { level: 1, name: '系統設定' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Google OAuth 憑證配置' })).toBeVisible();
    await expect(page.getByLabel('新增允許登入的 Google Email')).toBeVisible();
    await expect(page.getByText('admin@example.test')).toBeVisible();
    await expect(page.locator('.system-settings-allow-users')).toHaveCSS('background-color', 'rgb(20, 21, 26)');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `system settings horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`system-settings-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('Quick Token Drawer uses its feature styles on supported widths', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/ytmusic/playlist-sort');
    await page.getByRole('button', { name: /貼上 Token 啟用 0 配額/ }).click();

    const drawer = page.getByTestId('quick-token-drawer');
    await expect(drawer).toHaveCSS('background-color', 'rgb(24, 26, 31)');
    await page.getByRole('button', { name: '如何取得 Token？' }).click();
    await expect(page.getByText(/3 步驟快速取得/)).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `Quick Token Drawer horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('YouTube settings sub-navigation uses feature styles on supported widths', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'design-system-e2e', email: 'design-system@example.test' },
      authorizations: {},
      google_scopes: {},
      youtube: {
        active_slot: 'primary',
        slots: { primary: { label: 'Primary', configured: true, authenticated: true, can_be_active: true } },
      },
    },
  });

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/youtube/settings/connections');

    const navigation = page.getByRole('navigation', { name: 'YouTube 設定子導覽' });
    await expect(navigation).toHaveCSS('background-color', 'rgb(20, 21, 26)');
    await expect(navigation).toHaveCSS('gap', '6px');
    await expect(navigation.locator('a.active')).toHaveCSS('background-color', 'rgb(38, 42, 52)');

    await page.getByRole('button', { name: '修改憑證' }).first().click();
    await expect(page.getByLabel('OAuth Client Secret', { exact: true })).toBeVisible();
    await expect(page.locator('.youtube-slot-editor')).toHaveCSS('background-color', 'rgb(20, 21, 26)');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `YouTube settings horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);

    await page.goto('/youtube/settings/playlist');
    await expect(page.getByLabel('共用 To-Post 播放清單')).toBeVisible();
    await expect(page.locator('.youtube-playlist-header')).toHaveCSS('display', 'flex');
    const playlistOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(playlistOverflow, `YouTube playlist settings horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
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
    await expect(page.getByLabel(/影片標題 \(Title\)/)).toHaveValue('Sample Live');
    await expect(page.locator('.weverse-metadata-grid')).toHaveCSS('display', 'grid');
    await expect(page.locator('.weverse-quota-card')).toHaveCSS('background-color', 'rgba(99, 102, 241, 0.12)');

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

test('Google Sheets OAuth uses the backend URL and redirects to the provider', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/sheets/url': {
      auth_url: 'https://accounts.google.com/o/oauth2/auth?client_id=e2e-fixture',
    },
  });
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>OAuth fixture</title>' })
  );

  await page.goto('/settings/google');
  const authRequest = page.waitForRequest((request) => request.url().includes('/api/v1/auth/sheets/url'));
  await page.getByRole('button', { name: '連結 Google 試算表' }).click();
  await authRequest;

  await expect(page).toHaveURL(/accounts\.google\.com\/o\/oauth2\/auth\?client_id=e2e-fixture/);
  await expect(page).toHaveTitle('OAuth fixture');
});

test('Google account settings use feature styles and stay within supported viewport widths', async ({ page }) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/settings/google');

    const sectionHeading = page.locator('.account-settings-section-heading').first();
    await expect(sectionHeading).toBeVisible();
    await expect(sectionHeading.locator('h3')).toHaveCSS('font-size', '16.8px');

    const serviceLinks = page.locator('.account-settings-service-links').last();
    await expect(serviceLinks).toHaveCSS('display', 'flex');
    await expect(serviceLinks).toHaveCSS('flex-wrap', 'wrap');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('Playlist Sort previews and confirms creation of a sorted playlist', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'playlist-sort-e2e', email: 'music@example.test' },
      authorizations: {
        sheets: { connected: false },
        ytmusic: { connected: true, user: { email: 'music@example.test' } },
        video_uploader: { connected: false },
      },
      google_scopes: {},
      youtube: { slots: { primary: { authenticated: true, channel_title: 'Primary' } } },
    },
    '/api/v1/playlist-sort/playlists': {
      playlists: [{ id: 'playlist-1', title: '我的最愛音樂', item_count: 3, privacy_status: 'private' }],
    },
    '/api/v1/playlist-sort/preview': {
      preview: {
        total: 3,
        moved_count: 2,
        unchanged_count: 1,
        items: [
          {
            playlist_item_id: 'item-1',
            video_id: 'video-1',
            title: 'Song A',
            channel_title: 'Artist X',
            original_position: 0,
            new_position: 0,
            status: 'unchanged',
          },
          {
            playlist_item_id: 'item-2',
            video_id: 'video-2',
            title: 'Song C',
            channel_title: 'Artist Y',
            original_position: 1,
            new_position: 2,
            status: 'moved',
          },
          {
            playlist_item_id: 'item-3',
            video_id: 'video-3',
            title: 'Song B',
            channel_title: 'Artist Z',
            original_position: 2,
            new_position: 1,
            status: 'moved',
          },
        ],
      },
      preview_token: 'playlist-preview-token',
      quota_estimate: { total_units: 0, moved_count: 2, units_per_move: 0 },
    },
    '/api/v1/playlist-sort/apply': {
      mode: 'new_playlist',
      new_playlist_id: 'playlist-sorted',
      new_playlist_url: 'https://music.youtube.example/playlist?list=playlist-sorted',
      total: 3,
      moved: 3,
      succeeded: 3,
      failed: 0,
      quota_used: 0,
    },
  });

  await page.goto('/ytmusic/playlist-sort');
  await expect(page.getByRole('combobox').first()).toHaveValue('playlist-1');
  await page.getByRole('button', { name: '模擬預覽' }).click();
  await expect(page.getByRole('heading', { name: '左右比對預覽結果' })).toBeVisible();
  await expect(page.getByText('Song B').first()).toBeVisible();

  await page.getByLabel('另存為新排序歌單（保留原歌單備份）').check();
  await expect(page.getByRole('button', { name: '建立新排序歌單' })).toBeVisible();
  await page.getByRole('button', { name: '建立新排序歌單' }).click();
  await expect(page.getByRole('dialog', { name: '確認套用排序' })).toBeVisible();

  const applyRequestPromise = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/playlist-sort/apply')
  );
  await page.getByRole('button', { name: '確認套用' }).click();
  const applyRequest = await applyRequestPromise;
  expect(applyRequest.postDataJSON()).toMatchObject({
    playlist_id: 'playlist-1',
    preview_token: 'playlist-preview-token',
    mode: 'new_playlist',
    new_playlist_title: '[已排序] 我的最愛音樂',
    sorted_item_ids: ['item-1', 'item-3', 'item-2'],
  });
  await expect(page.getByRole('link', { name: /前往 YouTube Music 查看新歌單/ })).toBeVisible();
});

test('YouTube Batch Update checks a full preview before executing the update', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'batch-update-e2e', email: 'creator@example.test' },
      authorizations: {
        sheets: { connected: true },
        ytmusic: { connected: false },
        video_uploader: { connected: true },
      },
      google_scopes: {},
      youtube: { active_slot: 'primary', slots: { primary: { authenticated: true, channel_title: 'Primary' } } },
    },
    '/api/v1/settings/system': { default_spreadsheet_id: 'sheet-a', default_playlist_id: 'playlist-a' },
    '/api/v1/settings/youtube-drafts': async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({
        status: 200,
        json: {
          video: {
            spreadsheet_id: 'sheet-a',
            worksheet_name: 'Youtube Video',
            title_column: 'Youtube Title',
            description_column: 'Youtube Description',
          },
        },
      });
    },
    '/api/v1/sheets/metadata': {
      spreadsheet_id: 'sheet-a',
      spreadsheet_title: 'Creator Data',
      worksheets: [{ title: 'Youtube Video', columns: ['Youtube Title', 'Youtube Description'] }],
    },
    '/api/v1/sheets/parse-options': { teams: ['團體 A'] },
    '/api/v1/sheets/people': { people: ['人物甲'] },
    '/api/v1/sheets/random-member-preview': { person: '人物甲', values: {} },
    '/api/v1/youtube/playlist-items': {
      videos: [
        { video_id: 'video-1', title: '舊標題一', description: '舊描述一\n第二行' },
        { video_id: 'video-2', title: '保留標題', description: '保留描述' },
      ],
      source: 'youtube-api',
    },
    '/api/v1/youtube/batch-preview': {
      preview_token: 'batch-preview-token',
      preview_snapshot: { youtube_slot: 'primary' },
      plan: [
        {
          videoId: 'video-1',
          currentTitle: '舊標題一',
          currentDescription: '舊描述一\n第二行',
          newTitle: '新標題一',
          newDescription: '新描述一\n第二行',
          person: '人物甲',
          status: 'ready',
          willUpdate: true,
        },
        {
          videoId: 'video-2',
          currentTitle: '保留標題',
          currentDescription: '保留描述',
          newTitle: '',
          newDescription: '',
          person: '不編輯',
          status: 'skipped',
          reason: '未指定人物',
          willUpdate: false,
        },
      ],
    },
    '/api/v1/youtube/quota-estimate': {
      projected_units: 100,
      effective_available_units: 200,
      can_complete_today: true,
    },
    '/api/v1/youtube/batch-update': {
      completed: true,
      total_count: 2,
      succeeded_count: 1,
      skipped_count: 1,
      failed_count: 0,
    },
  });

  await page.goto('/youtube/drafts/videos');
  await expect(page.getByRole('combobox', { name: '所屬團體' })).toBeEnabled();
  await page.getByRole('textbox', { name: '主要試算表 ID / URL' }).fill('sheet-b');
  const metadataResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/sheets/metadata')
  );
  await page.getByRole('button', { name: '刷新工作表與欄位' }).click();
  await metadataResponsePromise;
  await expect(page.getByRole('combobox', { name: '使用的工作表' })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: '所屬團體' })).toBeEnabled();
  await page.getByRole('button', { name: '讀取 Video 草稿影片' }).click();
  await expect(page.getByText('舊標題一')).toBeVisible();
  await page.locator('.video-card-assignment select').first().selectOption('人物甲');
  await page.getByRole('button', { name: '檢查並更新標題與描述' }).click();

  const dialog = page.getByRole('dialog', { name: '確認批次更新 1 支影片' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('region', { name: '完整批次變更預覽' })).toContainText('新標題一');
  await expect(dialog).toContainText('100 單位');
  await expect(dialog).toContainText('200 單位');

  const updateRequestPromise = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/youtube/batch-update')
  );
  await dialog.getByRole('button', { name: '開始批次更新' }).click();
  const updateRequest = await updateRequestPromise;
  expect(updateRequest.postDataJSON()).toMatchObject({
    preview_token: 'batch-preview-token',
    assignments: [
      { video_id: 'video-1', person: '人物甲' },
      { video_id: 'video-2', person: '不編輯' },
    ],
  });
  await expect(page.locator('.result-panel')).toContainText('已執行完成');
  await expect(page.locator('.result-panel')).toContainText('成功 1 支影片');
});

test('Publish Cleaner confirms the loaded snapshot and completes the publish workflow', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'publish-cleaner-e2e', email: 'publisher@example.test' },
      authorizations: {
        sheets: { connected: false },
        ytmusic: { connected: false },
        video_uploader: { connected: true },
      },
      google_scopes: {},
      youtube: {
        active_slot: 'primary',
        routing_mode: 'manual',
        slots: {
          primary: {
            authenticated: true,
            channel_id: 'channel-e2e',
            channel_title: '發布測試頻道',
            token_status: 'active',
            user: { email: 'publisher@example.test' },
          },
        },
      },
    },
    '/api/v1/settings/system': { default_playlist_id: 'playlist-publish' },
    '/api/v1/youtube/playlist-items': {
      playlist_id: 'playlist-publish',
      videos: [
        { video_id: 'video-newer', title: '較新的影片', description: '描述二', published_at: '2026-02-02T00:00:00Z' },
        { video_id: 'video-older', title: '較早的影片', description: '描述一', published_at: '2026-02-01T00:00:00Z' },
      ],
      source: 'youtube-api',
      youtube_slot: 'primary',
      preview_token: 'publish-preview-token',
      preview_snapshot: {
        playlist_id: 'playlist-publish',
        youtube_slot: 'primary',
        data_version: 'publish-version-1',
        video_ids: ['video-newer', 'video-older'],
      },
      data_version: 'publish-version-1',
    },
    '/api/v1/youtube/quota-estimate': {
      operation: 'youtube.publish_cleanup',
      projected_units: 100,
      max_items_today: 2,
      can_complete_today: true,
    },
    '/api/v1/youtube/publish-and-cleanup': {
      operation: 'youtube.publish_cleanup',
      completed: true,
      total_count: 2,
      succeeded_count: 2,
      warning_count: 0,
      skipped_count: 0,
      failed_count: 0,
      not_attempted_count: 0,
      results: [
        { video_id: 'video-older', title: '較早的影片', status: 'succeeded' },
        { video_id: 'video-newer', title: '較新的影片', status: 'succeeded' },
      ],
    },
  });

  await page.goto('/youtube/publish-cleanup');
  const playlistRequestPromise = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/youtube/playlist-items')
  );
  await page.getByRole('button', { name: '讀取 To-Post 播放清單' }).click();
  await playlistRequestPromise;

  const videos = page.getByRole('list', { name: '待處理影片清單' }).getByRole('listitem');
  await expect(videos).toHaveCount(2);
  await expect(videos.nth(0)).toContainText('較早的影片');
  await expect(videos.nth(1)).toContainText('較新的影片');

  const quotaRequestPromise = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/youtube/quota-estimate')
  );
  await page.getByRole('button', { name: '設為公開並移出清單' }).click();
  expect((await quotaRequestPromise).postDataJSON()).toMatchObject({
    operation: 'youtube.publish_cleanup',
    item_count: 2,
    slot: 'primary',
  });

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('播放清單：playlist-publish');
  await expect(dialog).toContainText('授權組合：primary／頻道 發布測試頻道／帳號 publisher@example.test');
  await expect(dialog).toContainText('#1 較早的影片');
  await expect(dialog).toContainText('#2 較新的影片');
  await expect(dialog).toContainText('100 單位');

  const publishRequestPromise = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/youtube/publish-and-cleanup')
  );
  await dialog.getByRole('button', { name: '設為公開並移出清單' }).click();
  const publishRequest = await publishRequestPromise;
  expect(publishRequest.postDataJSON()).toMatchObject({
    playlist_id: 'playlist-publish',
    youtube_slot: 'primary',
    preview_token: 'publish-preview-token',
    preview_snapshot: {
      playlist_id: 'playlist-publish',
      youtube_slot: 'primary',
      video_ids: ['video-newer', 'video-older'],
    },
  });
  await expect(page.getByRole('heading', { name: '發布草稿已執行完成' })).toBeVisible();
  await expect(page.locator('.publish-result-panel')).toContainText('成功 2 支影片');
});

test('Photo Curator exports the assigned image and checklist in a ZIP download', async ({ page }) => {
  await mockAuthenticatedBackend(page);
  await page.goto('/photo-curator');

  const imageFile = {
    name: 'concert-photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/AP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8BP//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8BP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8QP//Z',
      'base64'
    ),
  };
  const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.photo-dropzone').click()]);
  await fileChooser.setFiles(imageFile);

  await expect(page.locator('.dropzone-stats')).toContainText('已匯入：1 張');
  await page.getByRole('button', { name: '+ P1' }).click();
  await expect(page.getByText('#01 封面')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '一鍵結構化打包 (ZIP)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Instagram_三部曲貼文_\d{4}-\d{2}-\d{2}\.zip$/);

  const archive = await JSZip.loadAsync(await readFile(await download.path()));
  expect(archive.file('Post_1_Post 1/01_COVER_concert-photo.jpg')).not.toBeNull();
  const checklist = await archive.file('貼文發布對照清單_Checklist.txt')?.async('string');
  expect(checklist).toContain('concert-photo.jpg [★ 首圖 Cover]');
});

test('Sticky Notes autosaves edits, toggles pin state, and deletes through its API', async ({ page }) => {
  let note: {
    id: string;
    content: string;
    remark: string;
    pinned: boolean;
    created_at: string;
    updated_at: string;
  } | null = {
    id: 'e2e-note-1',
    content: '初始內容',
    remark: 'E2E 備忘',
    pinned: false,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
  };
  await mockAuthenticatedBackend(page, {
    '/api/v1/notes': async (route) =>
      route.fulfill({ status: 200, json: { notes: note ? [note] : [], total: note ? 1 : 0 } }),
    '/api/v1/notes/e2e-note-1': async (route) => {
      if (route.request().method() === 'PUT' && note) {
        note = { ...note, ...route.request().postDataJSON() };
        await route.fulfill({ status: 200, json: { note, status: 'updated' } });
        return;
      }

      if (route.request().method() === 'DELETE' && note) {
        const deletedId = note.id;
        note = null;
        await route.fulfill({ status: 200, json: { deleted: true, note_id: deletedId } });
        return;
      }

      await route.fulfill({ status: 404, json: { detail: 'Not found' } });
    },
  });

  await page.goto('/notes');
  const contentInput = page.getByRole('textbox', { name: '便利貼文字內容' });
  await expect(contentInput).toHaveValue('初始內容');

  const saveRequest = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/api/v1/notes/e2e-note-1')
  );
  await contentInput.fill('已自動儲存的內容');
  await expect((await saveRequest).postDataJSON()).toMatchObject({ content: '已自動儲存的內容' });

  await page.getByRole('button', { name: '置頂便利貼' }).click();
  await expect(page.getByRole('button', { name: '取消置頂' })).toBeVisible();

  await page.getByRole('button', { name: '刪除便利貼' }).click();
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '尚未建立任何便利貼' })).toBeVisible();
});
