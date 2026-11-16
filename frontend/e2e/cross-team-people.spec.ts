import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';
import { personKey, personName } from '../src/features/sheets/model/personOptions';

const people = [
  { team: 'Team A', person: '甲', kind: 'person' as const, aliases: ['Alpha'] },
  { team: 'Team B', person: '乙', kind: 'person' as const, aliases: ['Beta'] },
  { team: 'Team B', person: '甲', kind: 'person' as const },
  { team: 'Team A', person: '', kind: 'team' as const },
  ...Array.from({ length: 5 }, (_, index) => ({
    team: 'Team B',
    person: `成員 ${index + 1}`,
    kind: 'person' as const,
  })),
];

async function setup(page) {
  let filter = { configured: false, team: '', teams: [] as string[], query: '', selected_people: [] as string[] };
  await mockAuthenticatedBackend(page, {
    '/api/v1/auth/user': {
      authenticated: true,
      user: { sub: 'people-test', email: 'people@example.test' },
      authorizations: { sheets: { connected: true } },
      youtube: { slots: { primary: { authenticated: true } }, active_slot: 'primary' },
    },
    '/api/v1/settings/shared': { default_spreadsheet_id: 'sheet-a', default_playlist_id: 'PLtest' },
    '/api/v1/settings/team-person-filter': async (route) => {
      if (route.request().method() === 'PUT') filter = { ...route.request().postDataJSON(), configured: true };
      await route.fulfill({ json: filter });
    },
    '/api/v1/settings/youtube-drafts': { video: {}, shorts: {} },
    '/api/v1/sheets/metadata': {
      spreadsheet_id: 'sheet-a',
      spreadsheet_title: 'People',
      worksheets: [
        { title: 'Youtube Video', columns: ['所屬團體', '人', 'Youtube Title', 'Youtube Description'] },
        { title: 'Youtube Shorts', columns: ['所屬團體', '人', 'Shorts Title', 'Shorts Description'] },
      ],
    },
    '/api/v1/sheets/parse-options': { teams: ['Team A', 'Team B'], people },
    '/api/v1/sheets/copy-table': {
      spreadsheet_id: 'sheet-a',
      worksheet_name: 'Youtube Video',
      columns: [{ key: 'title', label: 'Youtube Title', index: 0 }],
      rows: people.map((person, index) => ({
        row_number: index + 2,
        team: person.team,
        person: person.person,
        person_option: personName(person),
        cells: [`${person.team} ${personName(person)} title`],
      })),
    },
    '/api/v1/sheets/random-member-preview': { team: 'Team A', person: '甲', values: {} },
    '/api/v1/youtube/playlist-items': {
      playlist_id: 'PLtest',
      source: 'youtube-api',
      videos: [
        { video_id: 'video-1', title: '影片一' },
        { video_id: 'video-2', title: '影片二' },
      ],
    },
    '/api/v1/youtube/batch-preview': async (route) => {
      const payload = route.request().postDataJSON();
      await route.fulfill({
        json: {
          preview_token: 'signed',
          preview_snapshot: { youtube_slot: 'primary' },
          plan: payload.assignments.map((assignment) => ({
            videoId: assignment.video_id,
            person: assignment.person,
            status: 'ready',
            willUpdate: true,
            currentTitle: 'Old',
            currentDescription: '',
            newDescription: '',
            newTitle: assignment.person === personKey(people[0]) ? 'A title' : 'B title',
          })),
        },
      });
    },
    '/api/v1/youtube/quota-estimate': { can_complete_today: true },
  });
  return () => filter;
}

for (const width of [390, 768, 1440]) {
  test(`cross-team sheet selection, filters, undo and reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const savedFilter = await setup(page);
    await page.goto('/sheets/copy');
    const panel = page.getByRole('region', { name: '團體與人物篩選' });
    await expect(panel.getByRole('checkbox', { name: '甲 Team A' })).toBeEnabled();
    await panel.getByRole('checkbox', { name: '甲 Team A' }).check();
    await panel.getByRole('searchbox').fill('team b beta');
    await panel.getByRole('checkbox', { name: '乙 Team B' }).check();
    await expect(panel.getByRole('button', { name: '移除 甲 · Team A' })).toBeVisible();
    await panel.getByRole('button', { name: '清除人物搜尋' }).click();
    await expect(panel.getByRole('checkbox', { name: '甲 Team A' })).toBeChecked();
    await expect(panel.getByRole('checkbox', { name: '乙 Team B' })).toBeChecked();
    await expect(panel.getByRole('checkbox', { name: '甲 Team B' })).not.toBeChecked();
    await expect(page.getByText('2 列結果', { exact: true })).toBeVisible();
    await expect(page.getByTitle('Team A 甲 title')).toBeVisible();
    await expect(page.getByTitle('Team B 乙 title')).toBeVisible();

    await panel.getByRole('button', { name: 'Team B', exact: true }).click();
    await panel.getByRole('button', { name: '選取目前結果', exact: true }).click();
    if (width === 390) {
      await expect(panel.getByRole('button', { name: /查看全部已選/ })).toBeVisible();
      await panel.getByRole('button', { name: /查看全部已選/ }).click();
      await expect(panel.getByRole('button', { name: '移除 成員 5 · Team B' })).toBeVisible();
    }
    await panel.getByRole('button', { name: '取消選取目前結果', exact: true }).click();
    await expect(panel.getByRole('button', { name: '移除 甲 · Team A' })).toBeVisible();
    await panel.getByRole('searchbox').fill('does not exist');
    await expect(panel.getByText('找不到符合的人物')).toBeVisible();
    await panel.getByRole('button', { name: '清空選擇' }).click();
    await expect(panel.getByText('未限定人物')).toBeVisible();
    await expect(page.getByText('9 列結果', { exact: true })).toBeVisible();
    await expect(panel.getByRole('searchbox')).toHaveValue('does not exist');
    await panel.getByRole('button', { name: '復原', exact: true }).click();
    await panel.getByRole('button', { name: '重設篩選' }).click();
    await panel.getByRole('checkbox', { name: '乙 Team B' }).check();
    await expect.poll(() => savedFilter().selected_people).toEqual([personKey(people[0]), personKey(people[1])]);
    await expect.poll(() => savedFilter().query).toBe('');
    await page.reload();
    await expect(panel.getByRole('checkbox', { name: '甲 Team A' })).toBeChecked();
    await expect(panel.getByRole('checkbox', { name: '乙 Team B' })).toBeChecked();
    await expect(page.getByText('2 列結果', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/cross-team-people-${width}.png`, fullPage: true });
  });
}

for (const videoType of ['Video', 'Shorts']) {
  test(`batch ${videoType} retains assignments after filters clear and sends each composite identity`, async ({
    page,
  }) => {
    await setup(page);
    await page.goto(videoType === 'Video' ? '/youtube/drafts/videos' : '/youtube/drafts/shorts');
    const panel = page.getByRole('region', { name: '團體與人物篩選' });
    await expect(panel.getByRole('checkbox', { name: '甲 Team A' })).toBeEnabled();
    await panel.getByRole('checkbox', { name: '甲 Team A' }).check();
    await panel.getByRole('searchbox').fill('Beta');
    await panel.getByRole('checkbox', { name: '乙 Team B' }).check();
    await panel.getByRole('button', { name: '清除人物搜尋' }).click();
    await page.getByRole('button', { name: `讀取 ${videoType} 草稿影片` }).click();
    const assignments = page.locator('.video-card-assignment select');
    await expect(assignments).toHaveCount(2);
    const savedAssignments = page.waitForResponse((response) => {
      if (!response.url().endsWith('/settings/work-state') || response.request().method() !== 'PUT') return false;
      return response.request().postDataJSON().value?.assignments?.['video-2'] === personKey(people[1]);
    });
    await assignments.nth(0).selectOption(personKey(people[0]));
    await assignments.nth(1).selectOption(personKey(people[1]));
    await panel.getByRole('button', { name: '移除 甲 · Team A' }).click();
    await expect(assignments.nth(0)).toHaveValue(personKey(people[0]));
    await panel.getByRole('button', { name: '清空選擇' }).click();
    await expect(assignments.nth(0)).toHaveValue(personKey(people[0]));
    await expect(assignments.nth(1)).toHaveValue(personKey(people[1]));
    await expect(assignments.nth(0).locator('option')).toHaveCount(people.length + 1);
    const previewRequest = page.waitForRequest('**/youtube/batch-preview');
    await page.getByRole('button', { name: /產生完整.*預覽/ }).click();
    const payload = (await previewRequest).postDataJSON();
    expect(payload.team).toBe('');
    expect(payload.assignments).toEqual([
      { video_id: 'video-1', person: personKey(people[0]) },
      { video_id: 'video-2', person: personKey(people[1]) },
    ]);
    await expect(page.getByRole('region', { name: '完整批次變更預覽' })).toContainText('A title');
    await expect(page.getByRole('region', { name: '完整批次變更預覽' })).toContainText('B title');
    await savedAssignments;
    await page.reload();
    await expect(panel.getByRole('checkbox', { name: '甲 Team A' })).toBeEnabled();
    await page.getByRole('button', { name: `讀取 ${videoType} 草稿影片` }).click();
    await expect(assignments.nth(0)).toHaveValue(personKey(people[0]));
    await expect(assignments.nth(1)).toHaveValue(personKey(people[1]));
  });
}
