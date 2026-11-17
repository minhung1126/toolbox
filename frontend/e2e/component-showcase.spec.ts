import { personKey } from '../src/features/sheets/model/personOptions';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

import { mockAuthenticatedBackend, draftPublishResponses } from './fixtures';

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
        youtube_primary: {
          client_id: '',
          has_client_secret: false,
          client_secret_masked: '',
          configured: false,
        },
        youtube_secondary: {
          client_id: '',
          has_client_secret: false,
          client_secret_masked: '',
          configured: false,
        },
      },
      public_base_url: 'https://toolbox.example.test',
      redirect_uri: 'https://toolbox.example.test/api/v1/auth/callback',
    },
    '/api/v1/system/allowlist': {
      allowed_emails: ['admin@example.test', 'viewer@example.test'],
      current_user_email: 'admin@example.test',
      allow_new_users: true,
      allowlist_required: true,
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

test('system settings keeps the edit controls closed when a read response is malformed', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/system/credentials': { status: 'success', credentials: {} },
    '/api/v1/system/allowlist': {
      allowed_emails: [],
      current_user_email: 'admin@example.test',
      allow_new_users: true,
      allowlist_required: true,
    },
  });
  await page.goto('/system/settings');
  await expect(page.getByText('系統設定待核對')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新讀取' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新增成員' })).toHaveCount(0);
});

test('Quick Token Drawer uses its feature styles on supported widths', async ({ page }, testInfo) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/ytmusic/playlist-sort');
    const pageHeader = page.locator('.ui-page-header');
    await expect(pageHeader.getByRole('heading', { level: 1, name: 'YouTube Music 播放清單排序' })).toBeVisible();
    await pageHeader.screenshot({ path: testInfo.outputPath(`playlist-sort-header-${width}.png`) });
    await page.getByRole('button', { name: /管理瀏覽器 Token/ }).click();

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

test('YouTube Music settings use feature styles and remain usable on supported widths', async ({ page }, testInfo) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'ytmusic-settings-e2e', email: 'music@example.test' },
      authorizations: {
        sheets: { connected: false },
        ytmusic: { connected: true, has_custom_token: true, user: { email: 'music@example.test' } },
      },
      google_scopes: {},
      youtube: { slots: {} },
    },
  });

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/ytmusic/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'YouTube Music 設定' })).toBeVisible();
    await page.getByText('進階：Token 管理與憑證資訊').click();
    await expect(page.locator('.ytmusic-token-active-panel')).toBeVisible();
    await expect(page.locator('.ytmusic-code-reference')).toBeVisible();

    await page.getByLabel('顯示地區與語言偏好').selectOption('custom');
    await expect(page.getByLabel('語言代碼 (Language)')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `YouTube Music settings horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`ytmusic-settings-${width}.png`),
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
    await expect(page.getByRole('heading', { level: 1, name: '試算表內容複製' })).toBeVisible();

    const optionsPadding = await page
      .locator('.sheet-copy-page-options')
      .evaluate((element) => getComputedStyle(element).padding);
    expect(optionsPadding, `feature styles did not load at ${width}px`).toBe('12px 16px');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('Google Sheets settings stay usable on supported viewport widths', async ({ page }, testInfo) => {
  await mockAuthenticatedBackend(page);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/sheets/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Google 試算表設定' })).toBeVisible();
    await expect(page.getByRole('button', { name: '立即儲存帳號設定' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`sheets-settings-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
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
    await expect(page.getByRole('heading', { level: 1, name: 'Instagram 貼文排版工作台' })).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: '清理 To-Post' })).toBeVisible();

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
    await expect(page.getByRole('heading', { level: 1, name: 'Video 快速套用' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /試算表隨機抽查/ })).toHaveCSS('display', 'flex');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
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
      },
      google_scopes: {},
      youtube: { slots: { primary: { authenticated: true, channel_title: 'Primary', channel_id: 'channel-e2e' } } },
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
      failed_items: [],
      quota_used: 0,
    },
  });

  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/ytmusic/playlist-sort');
  await expect(page.getByRole('combobox').first()).toHaveValue('playlist-1');
  await page.getByRole('button', { name: '釘選目前播放清單至頂端常用' }).click();
  await page.getByRole('button', { name: '取消釘選「我的最愛音樂」' }).click();
  await expect(page.getByRole('button', { name: '快速切換至「我的最愛音樂」' })).toHaveCount(0);
  await page.getByRole('button', { name: '模擬預覽' }).click();
  await expect(page.getByRole('heading', { name: '左右比對預覽結果' })).toBeVisible();
  await expect(page.getByText('Song B').first()).toBeVisible();
  await expect(page.locator('.playlist-preview-list').first()).toHaveCSS('background-color', 'rgb(20, 21, 26)');
  const previewOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(previewOverflow, 'Playlist Sort preview horizontal overflow at 390px').toBeLessThanOrEqual(1);

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

test('YouTube drafts preserve manual edits through reload and publish after final confirmation', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'batch-update-e2e', email: 'creator@example.test' },
      authorizations: {
        sheets: { connected: true },
        ytmusic: { connected: false },
      },
      google_scopes: {},
      youtube: {
        active_slot: 'primary',
        slots: { primary: { authenticated: true, channel_title: 'Primary', channel_id: 'channel-e2e' } },
      },
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
    '/api/v1/sheets/parse-options': {
      teams: ['團體 A'],
      people: [{ team: '團體 A', person: '人物甲', kind: 'person' }],
    },
    '/api/v1/sheets/people': { people: ['人物甲'] },
    '/api/v1/sheets/random-member-preview': { person: '人物甲', values: {} },
    '/api/v1/youtube/playlist-items': {
      playlist_id: 'playlist-a',
      videos: [
        { video_id: 'video-1', title: '舊標題一', description: '舊描述一\n第二行' },
        { video_id: 'video-2', title: '保留標題', description: '保留描述' },
      ],
      source: 'youtube-api',
    },
    ...draftPublishResponses({ titleFor: () => '新標題一', descriptionFor: () => '新描述一\n第二行' }),
  });

  await page.goto('/youtube/drafts/videos');
  await expect(page.locator('.filter-panel')).toHaveCount(2);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1);
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      panels: Array.from(document.querySelectorAll('.filter-panel')).map((panel) => ({
        left: panel.getBoundingClientRect().left,
        right: panel.getBoundingClientRect().right,
        scrollWidth: panel.scrollWidth,
        clientWidth: panel.clientWidth,
      })),
    }));
    expect(
      geometry.overflow,
      `filter panel horizontal overflow at ${width}px: ${JSON.stringify(geometry)}`
    ).toBeLessThanOrEqual(1);
    for (const panel of geometry.panels) {
      expect(panel.right, `filter panel right edge at ${width}px`).toBeLessThanOrEqual(width);
      expect(panel.scrollWidth - panel.clientWidth, `filter panel content overflow at ${width}px`).toBeLessThanOrEqual(
        1
      );
    }
  }
  await expect(page.getByRole('checkbox', { name: '人物甲 團體 A' })).toBeEnabled();
  await page.getByText(/修改來源設定/).click();
  await page.getByRole('textbox', { name: '主要試算表 ID / URL' }).fill('sheet-b');
  const metadataResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/sheets/metadata')
  );
  await page.getByRole('button', { name: '刷新工作表與欄位' }).click();
  await metadataResponsePromise;
  await expect(page.getByRole('combobox', { name: '使用的工作表' })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: '人物甲 團體 A' })).toBeEnabled();
  await page.getByRole('button', { name: '讀取 Video 草稿影片' }).click();
  await expect(page.getByText('舊標題一')).toBeVisible();
  await page
    .locator('.video-card-assignment select')
    .first()
    .selectOption(personKey({ team: '團體 A', person: '人物甲', kind: 'person' }));
  const writes = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/youtube/drafts/publish-jobs')) writes.push(request);
  });
  await page.getByRole('button', { name: '套用人物並建立草稿' }).click();
  await expect(page.getByRole('heading', { name: 'Video 編輯草稿並公開' })).toBeVisible();
  await page.getByRole('article').first().getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByLabel('標題', { exact: true }).fill('最後人工修改');
  await page.getByLabel('描述', { exact: true }).fill('最後完整描述\n第二行');
  await page.getByRole('button', { name: '儲存暫存', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('article').first()).toContainText('最後人工修改');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      body: document.body.getAttribute('style'),
      overflowing: [...document.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width > 0)
        .map((el) => ({
          tag: el.tagName,
          className: el.className,
          right: el.getBoundingClientRect().right,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }))
        .slice(0, 20),
    }));
    expect(layout.overflow, JSON.stringify(layout)).toBeLessThanOrEqual(1);
  }
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: '檢查變更與配額' }).click();
  await expect(page.getByRole('region', { name: '最終變更摘要' })).toContainText('50 units');
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: '確認編輯並公開', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('50 units');
  await dialog.getByRole('button', { name: '確認編輯並公開', exact: true }).click();
  await expect(page.getByRole('article').first()).toContainText('已寫入 YouTube');
  expect(writes).toHaveLength(1);
  expect(writes[0].postDataJSON()).toMatchObject({
    preview_token: 'signed-final',
    edits: [
      { video_id: 'video-1', title: '最後人工修改', description: '最後完整描述\n第二行', skip: false },
      { video_id: 'video-2', skip: true },
    ],
  });
});

test('cleanup previews exact public items and only removes members after confirmation', async ({ page }) => {
  const items = [
    { playlist_id: 'playlist-cleanup', playlist_item_id: 'item-1', video_id: 'video-1', title: '已公開影片', description: '', observed_privacy: 'public', candidate: true, reason: '已公開，可清理' },
    { playlist_id: 'playlist-cleanup', playlist_item_id: 'item-2', video_id: 'video-1', title: '同片另一成員', description: '', observed_privacy: 'public', candidate: true, reason: '已公開，可清理' },
    { playlist_id: 'playlist-cleanup', playlist_item_id: 'item-3', video_id: 'private', title: '私人影片', description: '', observed_privacy: 'private', candidate: false, reason: '尚未公開，保留' },
  ];
  const snapshot = { version: 2, mode: 'cleanup_only', playlist_id: 'playlist-cleanup', youtube_channel_id: 'channel-e2e', youtube_slot: 'primary', items };
  let writes = 0;
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': { authenticated: true, user: { sub: 'cleanup-user' }, youtube: { active_slot: 'primary', slots: { primary: { authenticated: true, channel_id: 'channel-e2e' } } } },
    '/api/v1/settings/system': { default_playlist_id: 'playlist-cleanup' },
    '/api/v1/youtube/cleanup-preview': { ...snapshot, total_count: 3, candidate_count: 2, counts: { public: 2, private: 1, unlisted: 0, unknown: 0 }, preview_token: 'cleanup-token', preview_snapshot: snapshot },
    '/api/v1/youtube/quota-estimate': { projected_units: 165 },
    '/api/v1/youtube/publish-and-cleanup': async route => {
      writes += 1;
      expect(route.request().postDataJSON()).toMatchObject({ version: 2, mode: 'cleanup_only', preview_token: 'cleanup-token', preview_snapshot: snapshot });
      await route.fulfill({ json: { version: 2, mode: 'cleanup_only', operation: 'youtube.publish_cleanup', operation_id: 'cleanup-operation', completed: true, total_count: 3, succeeded_count: 2, skipped_count: 1, failed_count: 0, not_attempted_count: 0, needs_reconciliation_count: 0, quota_blocked: false, results: items.map(row => ({ ...row, status: row.candidate ? 'succeeded' : 'skipped' })) } });
    },
  });
  await page.goto('/youtube/publish-cleanup');
  await page.getByRole('button', { name: '讀取 To-Post 播放清單' }).click();
  await expect(page.locator('.cleanup-item')).toHaveCount(3);
  expect(writes).toBe(0);
  await expect(page.getByRole('button', { name: '編輯', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '清理已公開影片' }).click();
  await expect(page.getByRole('dialog')).toContainText('只移除預覽中的 2 筆清單成員');
  await page.getByRole('button', { name: '確認清理', exact: true }).click();
  await expect(page.getByText(/已移除 2 · 保留 1/)).toBeVisible();
  expect(writes).toBe(1);
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
  await page.getByRole('button', { name: '下載分組照片 (ZIP)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Instagram_3格貼文_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/);

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

test('Sticky Notes rejects a malformed list instead of showing an empty notebook', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/notes': { notes: [], total: 1 },
  });

  await page.goto('/notes');
  await expect(page.getByText('便利貼清單待核對')).toBeVisible();
  await expect(page.getByRole('heading', { name: '尚未建立任何便利貼' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新增便利貼' })).toBeDisabled();
});

test('Sticky Notes reconciles an ambiguous create without sending a duplicate', async ({ page }) => {
  const note = {
    id: 'e2e-created-note',
    content: '',
    remark: '',
    pinned: false,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
  };
  let created = false;
  let createRequests = 0;

  await mockAuthenticatedBackend(page, {
    '/api/v1/notes': async (route) => {
      if (route.request().method() === 'POST') {
        createRequests += 1;
        created = true;
        await route.fulfill({ status: 200, json: {} });
        return;
      }

      await route.fulfill({ status: 200, json: { notes: created ? [note] : [], total: created ? 1 : 0 } });
    },
  });

  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: '尚未建立任何便利貼' })).toBeVisible();
  await page.getByRole('button', { name: '新增便利貼', exact: true }).click();
  await expect(page.locator('[data-note-id="e2e-created-note"]')).toBeVisible();
  await expect(page.getByText('共 1 張便籤')).toBeVisible();
  expect(createRequests).toBe(1);
});
