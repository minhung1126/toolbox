import { expect, test, type Page, type Route } from '@playwright/test';
import { draftPublishResponses, mockAuthenticatedBackend } from './fixtures';
import { personKey } from '../src/features/sheets/model/personOptions';

test.use({ locale: 'zh-TW', timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });

const suffix = '\n完整描述最後一行';
const longDescription =
  ('完整描述第一行\n' + '保留每一行的舞台紀錄\n'.repeat(400) + 'https://example.test/' + 'x'.repeat(700))
    .padEnd(5000 - suffix.length, '字')
    .slice(0, 5000 - suffix.length) + suffix;
const person = personKey({ team: 'Team', person: 'Alice', kind: 'person' });

async function mockStagingBackend(page: Page, { failFirstPrepare = false, failFirstRead = false } = {}) {
  let readCalls = 0;
  let prepareCalls = 0;
  let writes = 0;
  const fakes = draftPublishResponses({ titleFor: () => '標'.repeat(100), descriptionFor: () => longDescription });
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'staging-e2e', email: 'staging@example.test' },
      authorizations: { sheets: { connected: true } },
      google_scopes: {},
      youtube: {
        active_slot: 'primary',
        slots: { primary: { authenticated: true, channel_id: 'channel-e2e', channel_title: 'Fixture' } },
      },
    },
    '/api/v1/settings/shared': { default_spreadsheet_id: 'sheet', default_playlist_id: 'playlist' },
    '/api/v1/settings/youtube-drafts': { video: {}, shorts: {} },
    '/api/v1/sheets/metadata': {
      worksheets: [
        { title: 'Youtube Video', columns: ['Youtube Title', 'Youtube Description'] },
        { title: 'Youtube Shorts', columns: ['Shorts Title', 'Shorts Description'] },
      ],
    },
    '/api/v1/sheets/parse-options': { teams: ['Team'], people: [{ team: 'Team', person: 'Alice', kind: 'person' }] },
    '/api/v1/sheets/random-member-preview': { person: 'Alice', values: {} },
    '/api/v1/youtube/playlist-items': async (route: Route) => {
      readCalls += 1;
      if (failFirstRead && readCalls === 1) {
        await route.fulfill({
          status: 503,
          json: { detail: { code: 'read_failed', message: '讀取失敗，請重試讀取。' } },
        });
        return;
      }
      await route.fulfill({
        json: {
          playlist_id: 'playlist',
          videos: [
            { video_id: 'applied', title: '先前已處理影片', description: 'Old' },
            { video_id: 'new', title: '新的待處理影片', description: 'New' },
          ],
          source: 'youtube-api',
        },
      });
    },
    '/api/v1/youtube/edit-status': { channel_id: 'channel-e2e', statuses: { applied: 'applied', new: 'unknown' } },
    ...fakes,
    '/api/v1/youtube/drafts/prepare': async (route: Route) => {
      prepareCalls += 1;
      if (failFirstPrepare && prepareCalls === 1) {
        await route.fulfill({ status: 504, json: { detail: { code: 'timeout', message: '測試連線逾時，請重試' } } });
        return;
      }
      await fakes['/api/v1/youtube/drafts/prepare'](route);
    },
    '/api/v1/youtube/drafts/publish-jobs': async (route: Route) => {
      writes += 1;
      await fakes['/api/v1/youtube/drafts/publish-jobs'](route);
    },
  });
  return { readCalls: () => readCalls, prepareCalls: () => prepareCalls, writes: () => writes };
}

function newVideoAssignment(page: Page) {
  return page.locator('.video-card').filter({ hasText: '新的待處理影片' }).getByRole('combobox');
}

test('draft list recovers after a 503 without submitting changes', { tag: '@recovery' }, async ({ page }) => {
  const backend = await mockStagingBackend(page, { failFirstRead: true });
  await page.goto('/youtube/drafts/videos');
  const read = page.getByRole('button', { name: '讀取 Video 草稿影片', exact: true });
  await read.click();
  const error = page.getByText('載入草稿影片失敗：讀取失敗，請重試讀取。', { exact: true });
  await expect(error).toBeVisible();
  await expect(read).toBeEnabled();

  await read.click();
  await expect(page.getByRole('heading', { name: '新的待處理影片', exact: true })).toBeVisible();
  await expect(error).toBeHidden();
  expect(backend.readCalls()).toBe(2);
  expect(backend.prepareCalls()).toBe(0);
  expect(backend.writes()).toBe(0);
});

for (const videoType of ['Video', 'Shorts']) {
  test(
    `${videoType} retries preparation and preserves manual edits when rebuild is cancelled`,
    { tag: '@recovery' },
    async ({ page }) => {
      const backend = await mockStagingBackend(page, { failFirstPrepare: true });
      const selectionPath = `/youtube/drafts/${videoType === 'Video' ? 'videos' : 'shorts'}`;
      const read = page.getByRole('button', { name: `讀取 ${videoType} 草稿影片`, exact: true });
      const prepare = page.getByRole('button', { name: '套用人物並建立草稿' });
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.goto(selectionPath);
      await read.click();
      await expect(prepare).toBeDisabled();
      await expect(page.getByText('請先為至少一支影片指定人物。')).toBeVisible();
      await page.getByLabel('編輯套用狀態').selectOption('not_applied');
      await expect(page.locator('.video-card')).toHaveCount(1);
      await expect(page.locator('.video-card')).toContainText('新的待處理影片');
      await page.getByLabel('搜尋影片').fill('no match');
      await expect(page.getByText(/沒有符合目前搜尋/)).toBeVisible();
      await page.getByLabel('搜尋影片').fill('');
      const workStateKey = videoType === 'Video' ? 'youtube_draft_video' : 'youtube_draft_shorts';
      await Promise.all([
        page.waitForResponse((response) => {
          const request = response.request();
          if (!response.ok() || request.method() !== 'PUT' || !response.url().endsWith('/settings/work-state')) {
            return false;
          }
          const { key, value } = request.postDataJSON();
          return key === workStateKey && value?.assignments?.new === person;
        }),
        newVideoAssignment(page).selectOption(person),
      ]);
      await prepare.click();
      await expect(page.getByText(/建立暫存失敗：測試連線逾時/)).toBeVisible();
      await expect(prepare).toBeEnabled();
      await prepare.click();
      await expect(page.getByRole('heading', { name: `${videoType} 編輯草稿並公開` })).toBeVisible();
      expect(backend.prepareCalls()).toBe(2);
      const card = page.getByRole('article', { name: '暫存影片 new' });
      await card.getByRole('button', { name: '編輯', exact: true }).click();
      await page.getByLabel('標題', { exact: true }).fill('保存的手動標題');
      await page.getByRole('button', { name: '儲存暫存', exact: true }).click();
      await page.reload();
      await expect(card).toContainText('保存的手動標題');
      await page.getByRole('link', { name: '返回人物指定／重建暫存' }).click();
      await read.click();
      await expect(newVideoAssignment(page)).toHaveValue(person);
      await prepare.click();
      const rebuild = page.getByRole('dialog', { name: '重建發布前暫存？' });
      await rebuild.getByRole('button', { name: '取消', exact: true }).click();
      await expect(rebuild).toBeHidden();
      expect(backend.prepareCalls()).toBe(2);
      await page.getByRole('link', { name: '繼續編輯草稿並公開' }).click();
      await expect(card).toContainText('保存的手動標題');
      expect(backend.writes()).toBe(0);
    }
  );
}

for (const width of [390, 768, 1440]) {
  test(
    `staged content fits and modal editing restores focus at ${width}px`,
    { tag: '@responsive' },
    async ({ page }, testInfo) => {
      const backend = await mockStagingBackend(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/youtube/drafts/videos');
      await page.getByRole('button', { name: '讀取 Video 草稿影片', exact: true }).click();
      await newVideoAssignment(page).selectOption(person);
      await page.getByRole('button', { name: '套用人物並建立草稿' }).click();

      const card = page.getByRole('article', { name: '暫存影片 new' });
      const description = card.getByLabel('預計套用的描述');
      await expect(description).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => description.textContent()).toBe(longDescription);
      await expect(description).toHaveCSS('white-space', 'pre-wrap');
      await expect
        .poll(() => description.evaluate((element) => element.scrollHeight - element.clientHeight))
        .toBeLessThanOrEqual(1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`staged-Video-${width}.png`), animations: 'disabled' });

      const edit = card.getByRole('button', { name: '編輯', exact: true });
      await edit.click();
      const title = page.getByLabel('標題', { exact: true });
      await expect(title).toBeFocused();
      await title.fill('未儲存修改');
      await page.keyboard.press('Escape');
      await page
        .getByRole('dialog', { name: '捨棄尚未儲存的修改？' })
        .getByRole('button', { name: '捨棄修改' })
        .click();
      await expect(edit).toBeFocused();
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
      await expect(card).not.toContainText('未儲存修改');
      expect(backend.writes()).toBe(0);
    }
  );
}
