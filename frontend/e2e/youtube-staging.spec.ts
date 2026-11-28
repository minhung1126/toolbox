import { expect, test, type Route } from '@playwright/test';
import { draftPublishResponses, mockAuthenticatedBackend } from './fixtures';
import { personKey } from '../src/features/sheets/model/personOptions';

test.use({ locale: 'zh-TW', timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });

const suffix = '\n完整描述最後一行';
const longDescription = ('完整描述第一行\n' + '保留每一行的舞台紀錄\n'.repeat(400) + 'https://example.test/' + 'x'.repeat(700)).padEnd(5000 - suffix.length, '字').slice(0, 5000 - suffix.length) + suffix;
const person = personKey({ team: 'Team', person: 'Alice', kind: 'person' });

for (const videoType of ['Video', 'Shorts']) {
  test(`${videoType} filters, rebuild confirmation and modal editing preserve drafts at mobile and desktop widths`, async ({
    page,
  }, testInfo) => {
    let prepareCalls = 0;
    let writes = 0;
    let failPrepare = false;
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
      '/api/v1/youtube/playlist-items': {
        playlist_id: 'playlist',
        videos: [
          { video_id: 'applied', title: '先前已處理影片', description: 'Old' },
          { video_id: 'new', title: '新的待處理影片', description: 'New' },
        ],
        source: 'youtube-api',
      },
      '/api/v1/youtube/edit-status': { channel_id: 'channel-e2e', statuses: { applied: 'applied', new: 'unknown' } },
      ...fakes,
      '/api/v1/youtube/drafts/prepare': async (route: Route) => {
        prepareCalls += 1;
        if (failPrepare) {
          failPrepare = false;
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
    const selectionPath = `/youtube/drafts/${videoType === 'Video' ? 'videos' : 'shorts'}`;
    await page.goto(selectionPath);
    await page.addStyleTag({ content: ":root { --font-sans: 'Noto Sans CJK TC', sans-serif; }" });
    await page.getByRole('button', { name: `讀取 ${videoType} 草稿影片` }).click();
    const prepare = page.getByRole('button', { name: '套用人物並建立草稿' });
    await expect(prepare).toBeDisabled();
    await expect(page.getByText('請先為至少一支影片指定人物。')).toBeVisible();
    await page.getByLabel('編輯套用狀態').selectOption('not_applied');
    await expect(page.locator('.video-card')).toHaveCount(1);
    await expect(page.locator('.video-card')).toContainText('新的待處理影片');
    await page.getByLabel('搜尋影片').fill('no match');
    await expect(page.getByText(/沒有符合目前搜尋/)).toBeVisible();
    await page.getByLabel('搜尋影片').fill('');
    await page.locator('.video-card-assignment select').selectOption(person);
    failPrepare = true;
    await prepare.click();
    await expect(page.getByText(/建立暫存失敗：測試連線逾時/)).toBeVisible();
    await expect(prepare).toBeEnabled();
    await prepare.click();
    await expect(page.getByRole('heading', { name: `${videoType} 編輯草稿並公開` })).toBeVisible();
    expect(prepareCalls).toBe(2);
    const card = page.getByRole('article', { name: '暫存影片 new' });
    await expect(card.getByLabel('預計套用的描述')).toHaveText(longDescription);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      await expect(card.getByLabel('預計套用的描述')).toHaveCSS('white-space', 'pre-wrap');
      const text = card.getByLabel('預計套用的描述');
      expect(await text.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(`staged-${videoType}-${width}.png`),
        animations: 'disabled',
      });
      const edit = card.getByRole('button', { name: '編輯', exact: true });
      await edit.click();
      await expect(page.getByLabel('標題', { exact: true })).toBeFocused();
      await page.getByLabel('標題', { exact: true }).fill('未儲存修改');
      await page.keyboard.press('Escape');
      await page
        .getByRole('dialog', { name: '捨棄尚未儲存的修改？' })
        .getByRole('button', { name: '捨棄修改' })
        .click();
      await expect(edit).toBeFocused();
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await card.getByRole('button', { name: '編輯', exact: true }).click();
    await page.getByLabel('標題', { exact: true }).fill('保存的手動標題');
    await page.getByRole('button', { name: '儲存暫存', exact: true }).click();
    await page.reload();
    await expect(card).toContainText('保存的手動標題');
    await page.screenshot({ path: testInfo.outputPath('staging-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath('staging-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: '返回人物指定／重建暫存' }).click();
    await page.getByRole('button', { name: `讀取 ${videoType} 草稿影片` }).click();
    await expect(
      page
        .locator('.video-card-assignment select')
        .filter({ has: page.locator(`option[value='${person}']`) })
        .first()
    ).toBeVisible();
    await page.getByRole('button', { name: '套用人物並建立草稿' }).click();
    await expect(page.getByRole('dialog', { name: '重建發布前暫存？' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    expect(prepareCalls).toBe(2);
    await page.getByRole('link', { name: '繼續編輯草稿並公開' }).click();
    await expect(card).toContainText('保存的手動標題');
    expect(writes).toBe(0);
  });
}
