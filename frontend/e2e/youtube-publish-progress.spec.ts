import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

const source = { spreadsheet_url_or_id: 'sheet', playlist_id: 'playlist', video_type: 'Video', worksheet_name: 'Videos', title_column: 'Title', description_column: 'Description', team: '', assignments: Array.from({length: 10}, (_, i) => ({video_id: `video-${i + 1}`, person: 'Alice'})) };
const stage = { version: 1, stage_id: 'progress-stage', video_type: 'Video', youtube_slot: 'primary', youtube_channel_id: 'progress-channel', source, plan: source.assignments.map(row => ({ ...row, person_key: row.person, currentTitle: `Original ${row.video_id}`, currentDescription: '', currentPrivacy: 'private', newTitle: `Final ${row.video_id}`, newDescription: `Manual text ${row.video_id}`, status: 'ready', reason: '', thumbnailUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E' })) };
const statuses = ['queued', 'running', 'succeeded', 'unchanged', 'skipped', 'failed', 'not_attempted', 'needs_reconciliation'];
function progress(edits, complete, allSucceeded = false) {
  const rows = edits.map((edit, i) => ({ ...edit, person: 'Alice', status: allSucceeded || i === 0 || complete && i === 1 ? 'succeeded' : complete ? i === 2 ? 'needs_reconciliation' : 'not_attempted' : i === 1 ? 'running' : 'queued', attempted_parts: i < (complete ? 3 : 2) ? ['snippet', 'status'] : [], confirmation: i < (complete ? 2 : 1) || allSucceeded ? 'provider_response' : null }));
  return { version: 1, revision: complete ? 3 : 2, total: rows.length, rows, counts: Object.fromEntries(statuses.map(status => [status, rows.filter(row => row.status === status).length])) };
}
async function setup(page, loseResponse = false) {
  let submitted: any, complete = false, writes = 0;
  await page.addInitScript(({source, stage}) => {
    if (sessionStorage.getItem('already-seeded')) return;
    localStorage.setItem('toolbox:youtube-publish-draft:v1:progress-user:progress-channel:Video', JSON.stringify({ account: 'progress-user', source, context: JSON.stringify(source), stage_token: 'signed-stage', stage_snapshot: stage, edits: stage.plan.map(row => ({video_id: row.video_id, title: row.newTitle, description: row.newDescription, skip: false})) }));
  }, {source, stage});
  const operation = () => ({ version: 2, id: 'progress-operation', kind: 'youtube.metadata_publish', channel_id: 'progress-channel', state: complete ? loseResponse ? 'completed' : 'needs_reconciliation' : 'running', plan: { stage_snapshot: stage, edits: submitted.edits }, progress: progress(submitted.edits, complete, loseResponse) });
  const lookup = async route => { await route.fulfill(submitted ? {json: operation()} : {status: 404, json: {detail: {code: 'operation_not_found', message: '尚未受理'}}}); };
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {authenticated: true, user: {sub: 'progress-user'}, youtube: {active_slot: 'primary', slots: {primary: {authenticated: true, channel_id: 'progress-channel'}}}},
    '/api/v1/settings/system': {default_playlist_id: 'playlist'},
    '/api/v1/youtube/drafts/preview': async route => {
      const payload = route.request().postDataJSON();
      const plan = payload.edits.map(edit => ({...edit, person: 'Alice', status: 'ready', parts: ['snippet','status'], write_units: 50, reason: ''}));
      await route.fulfill({json: {preview_token: 'signed-final', preview_snapshot: {youtube_slot: 'primary', plan}, plan, quota: {write_calls: 10, write_units: 500, read_units: 11, projected_units: 511}}});
    },
    '/api/v1/youtube/drafts/publish-jobs': async route => {
      submitted = route.request().postDataJSON(); writes += 1;
      if (loseResponse) { complete = true; await route.abort('failed'); return; }
      await route.fulfill({status: 202, json: {version: 1, operation_id: 'progress-operation', state: 'prepared', progress: progress(submitted.edits, false)}});
    },
    '/api/v1/operations/progress-operation': lookup,
    '/api/v1/youtube/drafts/publish-jobs/by-request/*': lookup,
  });
  return {finish: () => { complete = true; }, writes: () => writes};
}
async function publish(page) {
  await page.goto('/youtube/drafts/videos/staged');
  await page.getByRole('button', {name: '檢查變更與配額'}).click();
  await page.getByRole('button', {name: '確認編輯並公開', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: '確認編輯並公開', exact: true}).click();
}

test('ten-video progress survives reload and keeps timeout and unattempted rows separate', async ({page}) => {
  const controller = await setup(page);
  await publish(page);
  await expect(page.getByRole('region', {name: '發布進度'})).toContainText('成功 1');
  await expect(page.getByRole('article', {name: '暫存影片 video-1', exact: true})).toContainText('已寫入 YouTube');
  // Only seed once; preserve the actual pending request/operation across reload.
  await page.evaluate(() => sessionStorage.setItem('already-seeded', 'true'));
  await page.reload();
  await expect(page.getByRole('region', {name: '發布進度'})).toContainText('成功 1');
  expect(controller.writes()).toBe(1);
  controller.finish();
  await expect(page.getByRole('region', {name: '發布進度'})).toContainText('成功 2');
  await expect(page.getByRole('region', {name: '發布進度'})).toContainText('尚未執行 7 · 待核對 1');
  await expect(page.getByRole('article', {name: '暫存影片 video-3'})).toContainText('待核對');
  await expect(page.getByRole('button', {name: '檢查變更與配額'})).toBeDisabled();
  expect(controller.writes()).toBe(1);
});

test('a lost 202 is recovered by its saved request with no repeat POST', async ({page}) => {
  const controller = await setup(page, true);
  await publish(page);
  await expect(page.getByRole('article', {name: '暫存影片 video-10'})).toContainText('已寫入 YouTube');
  await expect(page.getByRole('link', {name: '前往清理 To-Post'})).toBeVisible();
  expect(controller.writes()).toBe(1);
});
