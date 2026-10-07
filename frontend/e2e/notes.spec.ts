import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

for (const width of [390, 1440]) {
  test(`template notes duplicate, copy and persist at ${width}px`, async ({ page }) => {
    let notes: Record<string, any>[] = [];
    let serial = 0;
    await mockAuthenticatedBackend(page);
    await page.route(/\/api\/v1\/notes(?:\/[^/?]+)?(?:\?.*)?$/, async (route) => {
      const request = route.request();
      const method = request.method();
      if (method === 'GET') {
        await route.fulfill({ json: { notes, total: notes.length } });
      } else if (method === 'POST') {
        const note = {
          ...request.postDataJSON(),
          id: `note-${++serial}`,
          created_at: '2026-10-07T00:00:00Z',
          updated_at: '2026-10-07T00:00:00Z',
        };
        notes = [...notes, note];
        await route.fulfill({ json: { note, status: 'created' } });
      } else if (method === 'PUT') {
        const id = new URL(request.url()).pathname.split('/').pop();
        const note = { ...notes.find((item) => item.id === id), ...request.postDataJSON() };
        notes = notes.map((item) => (item.id === id ? note : item));
        await route.fulfill({ json: { note, status: 'updated' } });
      }
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (value: string) => {
            (window as any).copiedNote = value;
          },
        },
      });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/notes');
    await page.getByRole('button', { name: '新增模板便利貼' }).click();
    const original = page.locator('[data-note-id="note-1"]');
    await original.getByLabel('模板內容').fill('hi this is {name}. {name} {role}');
    await original.getByLabel('變數 name', { exact: true }).fill('min');
    await expect(original.getByLabel('替換結果')).toHaveText('hi this is min. min {role}');
    await original.getByRole('button', { name: '複製結果' }).click();
    expect(await page.evaluate(() => (window as any).copiedNote)).toBe('hi this is min. min {role}');
    await original.getByRole('button', { name: '建立副本' }).click();
    const duplicate = page.locator('[data-note-id="note-2"]');
    await expect(duplicate.getByLabel('變數 name', { exact: true })).toHaveValue('min');
    await duplicate.getByLabel('變數 name', { exact: true }).fill('max');
    await duplicate.getByLabel('變數 role', { exact: true }).fill('developer');
    await expect(duplicate.getByLabel('替換結果')).toHaveText('hi this is max. max developer');
    await expect(original.getByLabel('變數 name', { exact: true })).toHaveValue('min');
    await expect.poll(() => notes.find((note) => note.id === 'note-2')?.variables.role).toBe('developer');
    await expect.poll(() => notes.find((note) => note.id === 'note-1')?.variables.name).toBe('min');
    await page.reload();
    await expect(duplicate.getByLabel('替換結果')).toHaveText('hi this is max. max developer');
    await expect(original.getByLabel('替換結果')).toHaveText('hi this is min. min {role}');
    await page.screenshot({ path: test.info().outputPath(`templates-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
