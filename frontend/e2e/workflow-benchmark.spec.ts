import { expect, test, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { mockAuthenticatedBackend } from './fixtures';
import { personKey } from '../src/features/sheets/model/personOptions';

async function saveMetrics(info: TestInfo, data: {body: string; contentType: string}) {
  await writeFile(info.outputPath('workflow-metrics.json'), data.body);
  await info.attach('workflow-metrics.json', data);
}

// Fixed provider fakes, anonymous counts and durations only. This is an automation
// benchmark, not a claim about human completion times or production traffic.
for (const scenario of ['copy-six-cells', 'repeat-video-update', 'recover-video-read']) {
  test(`workflow benchmark ${scenario}`, async ({ page }, testInfo) => {
    let reads = 0;
    await page.addInitScript(() => {
      (window as any).__benchmark = { clicks: 0, settingsNavigations: 0, clipboard: [] };
      document.addEventListener('click', () => (window as any).__benchmark.clicks++, true);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as any).__benchmark.clipboard.push(text);
          },
        },
      });
    });
    const person = personKey({ team: 'Team', person: '甲', kind: 'person' });
    await mockAuthenticatedBackend(page, {
      '/api/v1/auth/user': {
        authenticated: true,
        user: { sub: 'benchmark', email: 'benchmark@example.test' },
        authorizations: { sheets: { connected: true } },
        youtube: { active_slot: 'primary', slots: { primary: { authenticated: true, channel_title: 'Fixture' } } },
      },
      '/api/v1/settings/shared': { default_spreadsheet_id: 'sheet', default_playlist_id: 'PLfixture' },
      '/api/v1/settings/youtube-drafts': {
        video: {
          spreadsheet_id: 'sheet',
          worksheet_name: 'Youtube Video',
          title_column: 'Title',
          description_column: 'Description',
        },
        shorts: {},
      },
      '/api/v1/sheets/metadata': {
        spreadsheet_id: 'sheet',
        spreadsheet_title: 'Fixture',
        worksheets: [{ title: 'Youtube Video', columns: ['所屬團體', '人', 'Title', 'Description'] }],
      },
      '/api/v1/sheets/parse-options': { teams: ['Team'], people: [{ team: 'Team', person: '甲', kind: 'person' }] },
      '/api/v1/sheets/copy-table': {
        spreadsheet_id: 'sheet',
        worksheet_name: 'Youtube Video',
        columns: [
          { key: 'a', label: 'Title', index: 0 },
          { key: 'b', label: 'Description', index: 1 },
        ],
        rows: [2, 3, 4].map((n) => ({
          row_number: n,
          team: 'Team',
          person: '甲',
          person_option: '甲',
          cells: [`A${n}`, `B${n}`],
        })),
      },
      '/api/v1/sheets/random-member-preview': { team: 'Team', person: '甲', values: {} },
      '/api/v1/youtube/playlist-items': async (route) => {
        if (++reads === 1 && scenario === 'recover-video-read') {
          await route.fulfill({
            status: 503,
            json: { detail: { code: 'read_failed', message: '讀取失敗，請重試讀取。' } },
          });
          return;
        }
        await route.fulfill({
          json: { playlist_id: 'PLfixture', videos: [{ video_id: 'video-1', title: 'Old', description: '' }] },
        });
      },
      '/api/v1/youtube/batch-preview': {
        preview_token: 'signed',
        preview_snapshot: { youtube_slot: 'primary' },
        plan: [
          {
            videoId: 'video-1',
            video_id: 'video-1',
            person,
            status: 'ready',
            willUpdate: true,
            currentTitle: 'Old',
            currentDescription: '',
            newTitle: 'New',
            newDescription: '',
          },
        ],
      },
      '/api/v1/youtube/quota-estimate': { can_complete_today: true, projected_units: 50, max_items_today: 1 },
      '/api/v1/youtube/batch-update': {
        operation: 'youtube.metadata_update',
        completed: true,
        quota_blocked: false,
        total_count: 1,
        succeeded_count: 1,
        warning_count: 0,
        skipped_count: 0,
        failed_count: 0,
        not_attempted_count: 0,
        results: [{ video_id: 'video-1', title: 'New', status: 'succeeded' }],
      },
    });
    let settingsNavigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && new URL(frame.url()).pathname.includes('/settings')) settingsNavigations++;
    });
    const host = process.env.TB_BENCHMARK_BASE_URL || '';
    await page.goto(`${host}${scenario === 'copy-six-cells' ? '/sheets/copy' : '/youtube/drafts/videos'}`);
    let selectionActions = 0;
    if (scenario === 'copy-six-cells') {
      await expect(page.locator('.sheet-copy-cell')).toHaveCount(6);
      await page.evaluate(() => {
        (window as any).__benchmark.clicks = 0;
      });
      const started = performance.now();
      if (await page.getByLabel('選取第 2 列', { exact: true }).count()) {
        for (const row of [2, 3, 4]) await page.getByLabel(`選取第 ${row} 列`, { exact: true }).check();
        await page.getByRole('button', { name: '複製已選內容', exact: true }).click();
        await expect(page.getByText('已複製 3 列已選內容到剪貼簿', { exact: true })).toBeVisible();
      } else {
        for (const cell of await page.locator('.sheet-copy-cell').all()) await cell.click();
      }
      const data = await page.evaluate(() => (window as any).__benchmark);
      expect(data.clipboard.length).toBeGreaterThan(0);
      await saveMetrics(testInfo, {
        body: JSON.stringify({
          version: 1,
          scenario,
          clicks: data.clicks,
          settingsNavigations,
          elapsedMs: Math.round(performance.now() - started),
          completed: true,
        }),
        contentType: 'application/json',
      });
    } else {
      const read = page.getByRole('button', { name: '讀取 Video 草稿影片', exact: true });
      await expect(read).toBeEnabled();
      await page.evaluate(() => {
        (window as any).__benchmark.clicks = 0;
      });
      const started = performance.now();
      await read.click();
      if (scenario === 'recover-video-read') {
        await expect(page.getByText(/讀取失敗/).first()).toBeVisible();
        await read.click();
      }
      await page.locator('.video-card-assignment select').selectOption(person);
      selectionActions++;
      await page.getByRole('button', { name: /產生完整批次預覽/ }).click();
      await page.getByRole('button', { name: /確認這份預覽並更新/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: '開始批次更新', exact: true }).click();
      await expect(page.getByText('YouTube 批次更新已執行完成', { exact: true })).toBeVisible();
      const data = await page.evaluate(() => (window as any).__benchmark);
      await saveMetrics(testInfo, {
        body: JSON.stringify({
          version: 1,
          scenario,
          clicks: data.clicks,
          selectionActions,
          settingsNavigations,
          elapsedMs: Math.round(performance.now() - started),
          completed: true,
          recoveredAfterReadError: scenario === 'recover-video-read',
        }),
        contentType: 'application/json',
      });
    }
  });
}
