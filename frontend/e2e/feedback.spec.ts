import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

test('shared confirmation styles preserve responsive layout and keyboard dismissal', async ({ page }) => {
  await mockAuthenticatedBackend(page, {
    '/api/v1/notes': async (route) =>
      route.fulfill({
        status: 200,
        json: {
          notes: [{ id: 'feedback-note', content: '檢查確認對話框', remark: '', pinned: false }],
          total: 1,
        },
      }),
  });

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/notes');
    const deleteButton = page.getByRole('button', { name: '刪除便利貼' });
    await deleteButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('background-color', 'rgb(28, 30, 36)');
    await expect(dialog).toHaveCSS('padding', '24px 28px');
    await expect(dialog.locator('.confirm-actions')).toHaveCSS(
      'flex-direction',
      width < 768 ? 'column-reverse' : 'row'
    );
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(deleteButton).toBeFocused();
  }
});
