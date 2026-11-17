import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend, toolCatalog } from './fixtures';
import { writeFile } from 'node:fs/promises';
for (const width of [390, 768, 1440]) {
  test(`multi-cell clipboard failure and preview at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      let first = true;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            if (first) {
              first = false;
              throw new Error('clipboard denied');
            }
            (window as any).__copied = text;
          },
        },
      });
    });
    await mockAuthenticatedBackend(page, {
      '/api/v1/settings/shared': { default_spreadsheet_id: 'sheet' },
      '/api/v1/sheets/metadata': {
        spreadsheet_id: 'sheet',
        spreadsheet_title: 'Fixture',
        worksheets: [{ title: 'Texts', columns: ['A', 'B'] }],
      },
      '/api/v1/sheets/parse-options': { teams: [], people: [] },
      '/api/v1/sheets/copy-table': {
        spreadsheet_id: 'sheet',
        worksheet_name: 'Texts',
        columns: [
          { key: 'a', label: 'A', index: 0 },
          { key: 'b', label: 'B', index: 1 },
        ],
        rows: [
          { row_number: 2, team: '', person: '', person_option: '', cells: ['中文\n換行', ''] },
          { row_number: 3, team: '', person: '', person_option: '', cells: ['第三列', '最後'] },
        ],
      },
    });
    await page.goto('/sheets/copy');
    await page.getByLabel('選取第 2 列', { exact: true }).check();
    await page.getByLabel('選取第 3 列', { exact: true }).check();
    await expect(page.getByLabel('貼上預覽')).toContainText('中文');
    const copy = page.getByRole('button', { name: '複製已選內容', exact: true });
    await copy.click();
    await expect(page.getByText(/複製失敗：clipboard denied/)).toBeVisible();
    await copy.click();
    await expect(page.getByText('已複製 2 列已選內容到剪貼簿', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__copied)).toBe('"中文\n換行"\t\n第三列\t最後');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
test('photo project restores arrangement after reload with explicitly reselected local files', async ({
  page,
}, testInfo) => {
  await mockAuthenticatedBackend(page);
  const file = testInfo.outputPath('local-photo.svg');
  await writeFile(
    file,
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>'
  );
  await page.goto('/photo-curator');
  await page.locator('.photo-dropzone input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '+ P1', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出排版專案', exact: true }).click();
  const project = await download;
  const projectPath = testInfo.outputPath('project.json');
  await project.saveAs(projectPath);
  await page.reload();
  await page.getByLabel('匯入專案 JSON').setInputFiles(projectPath);
  await page.getByRole('dialog').getByRole('button', { name: '載入專案', exact: true }).click();
  await expect(page.getByText(/1 張待補/)).toBeVisible();
  await page.getByLabel('重新選擇本機照片').setInputFiles(file);
  await expect(page.getByText(/0 張待補/)).toBeVisible();
  await expect(page.locator('.post-column-card').first()).toContainText('local-photo.svg');
});
test('bad catalog entry is isolated; health and operation records reflect their separate states', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/tools': {
      tools: toolCatalog.map((tool) => (tool.id === 'sticky-notes' ? { ...tool, version: '2.0.0' } : tool)),
    },
    '/api/v1/health': {
      ready: false,
      status: 'degraded',
      configuration: { google_oauth_ready: true, access_allowlist_ready: false },
      tools: { 'sticky-notes': { status: 'healthy' } },
      warnings: ['需要設定存取白名單'],
      commit_sha: 'development',
    },
    '/api/v1/operations': {
      version: 1,
      operations: [
        {
          version: 1,
          id: 'operation-fixture',
          kind: 'youtube.metadata_update',
          state: 'needs_reconciliation',
          created_at: 1,
          channel_id: 'Fixture',
          items: [
            { phase: 'metadata', state: 'completed' },
            { phase: 'metadata', state: 'needs_reconciliation' },
          ],
          plan: {},
        },
      ],
    },
  });
  await page.goto('/notes');
  await expect(page.getByText('此工具目前無法使用。')).toBeVisible();
  await page.goto('/system/health');
  await expect(page.getByText(/部署尚未就緒/)).toBeVisible();
  await expect(page.getByText('需要設定存取白名單', { exact: true })).toBeVisible();
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: '影片批次更新 · 待核對' })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/1 個已知成功寫入階段，1 個待核對階段/)).toBeVisible();
});

test('deep links record recent tools without restoring a retired pin', async ({page})=>{
  await mockAuthenticatedBackend(page, {'/api/v1/notes':{notes:[],total:0}});
  await page.goto('/notes');
  await expect(page.getByRole('heading',{name:'便利貼備忘錄',exact:true})).toBeVisible();
  await expect.poll(async()=>page.evaluate(()=>document.title)).toBe('便利貼備忘錄｜Toolbox');
  await page.getByRole('link',{name:'儀表板總覽',exact:true}).click();
  await expect(page.locator('section[aria-labelledby="dashboard-recent-title"]')).toContainText('便利貼備忘錄');
  await expect(page.getByText('Weverse 影片上傳',{exact:true})).toHaveCount(0);
});
