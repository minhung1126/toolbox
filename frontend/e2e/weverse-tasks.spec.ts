import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockAuthenticatedBackend } from './fixtures';

const parent = {
  task_id: 'original',
  title: 'Sample Live',
  status: 'completed',
  progress_percent: 100,
  current_step: '影片已上傳；部分字幕待處理。',
  updated_at: 'revision-1',
  video_id: 'existing-video',
  video_url: 'https://youtu.be/existing-video',
  caption_results: [
    { filename: 'ko.vtt', language: 'ko', name: 'Korean', status: 'uploaded', caption_id: 'existing-caption' },
    { filename: 'en.vtt', language: 'en', name: 'English', status: 'missing_file' },
  ],
};

test('upload history reopens partial results, survives reload, exports and retries only captions', async ({
  page,
}, testInfo) => {
  let mutations = 0;
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'uploader', email: 'uploader@example.test' },
      authorizations: { video_uploader: { connected: true, channel_title: 'Uploader' } },
      google_scopes: {},
      youtube: { slots: {} },
    },
    '/api/v1/weverse-uploader/history': { status: 'success', tasks: [parent] },
    '/api/v1/weverse-uploader/tasks/original': { status: 'success', task: parent },
    '/api/v1/weverse-uploader/tasks/original/retry-captions': async (route) => {
      mutations++;
      const body = route.request().postDataBuffer()?.toString() || '';
      expect(body).toContain('filename="en.vtt"');
      expect(body).toContain('revision-1');
      expect(body).not.toContain('name="video"');
      await route.fulfill({ json: { status: 'queued', task_id: 'retry' } });
    },
    '/api/v1/weverse-uploader/tasks/retry': {
      status: 'success',
      task: {
        ...parent,
        task_id: 'retry',
        parent_task_id: 'original',
        caption_results: parent.caption_results.map((item) => ({
          ...item,
          status: 'uploaded',
          caption_id: 'confirmed',
        })),
      },
    },
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/weverse-uploader');
  await page.getByRole('button', { name: '任務詳情' }).click();
  await expect(page).toHaveURL(/task=original/);
  await expect(page.getByRole('heading', { name: '上傳部分完成' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('partial-upload-mobile.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: '上傳部分完成' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 CSV' }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('missing_file');
  expect(csv).toContain('existing-video');
  await page
    .getByLabel('選取待補傳字幕')
    .setInputFiles({ name: 'en.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT') });
  await page.getByRole('button', { name: '核對與補傳字幕', exact: true }).click();
  await page.getByRole('button', { name: '確認執行字幕核對與補傳' }).click();
  await expect(page).toHaveURL(/task=retry/);
  await expect(page.getByRole('heading', { name: '上傳成功！' })).toBeVisible();
  expect(mutations).toBe(1);
});

test('a deep-linked active task resumes polling after reload', async ({ page }) => {
  let polls = 0;
  await mockAuthenticatedBackend(page, {
    '/api/v1/weverse-uploader/tasks/active': async (route) => {
      polls++;
      await route.fulfill({
        json: {
          status: 'success',
          task: { ...parent, task_id: 'active', status: 'uploading_video', progress_percent: 20 },
        },
      });
    },
  });
  await page.goto('/weverse-uploader?task=active');
  await expect(page.getByRole('progressbar', { name: '上傳進度' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('progressbar', { name: '上傳進度' })).toBeVisible();
  await expect.poll(() => polls).toBeGreaterThan(2);
});
