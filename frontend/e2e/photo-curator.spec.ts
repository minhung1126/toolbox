import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

for (const width of [390, 1440]) {
  test(`photo grouping and precise sorting at ${width}px`, async ({ page }) => {
    await mockAuthenticatedBackend(page);
    // Keep the larger photo cards visible together during pointer-based sorting.
    await page.setViewportSize({ width, height: width === 1440 ? 1600 : 1000 });
    await page.goto('/photo-curator');
    await page.locator('input[type=file]').setInputFiles(
      ['a', 'b', 'c'].map((name) => ({
        name: `${name}.svg`,
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="indigo"/></svg>'
        ),
      }))
    );
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ P1', exact: true }).first().click();
    await expect(page.locator('.ig-slot-badge')).toHaveText(['Post 3 封面', 'Post 2 封面', 'Post 1 封面']);
    const post1 = page.locator('[data-post-id=post-1]');
    const cards = post1.locator('.post-item-card');
    const thumbnailBox = await cards.first().locator('.photo-card-thumb-wrap').boundingBox();
    expect(thumbnailBox!.width).toBeGreaterThan(200);
    expect(thumbnailBox!.height).toBeGreaterThan(150);
    if (width === 1440) {
      await cards.nth(2).dragTo(cards.nth(0), { sourcePosition: { x: 20, y: 10 }, targetPosition: { x: 20, y: 10 } });
      await expect(post1.locator('.photo-card-name')).toHaveText(['c.svg', 'a.svg', 'b.svg']);
      await expect(cards.first()).toHaveClass(/is-cover-item/);
      await expect(page.locator('.ig-grid-slot').last().locator('img')).toHaveAttribute('alt', /c.svg/);
      const targetBox = await cards.nth(2).boundingBox();
      await cards.first().dragTo(cards.nth(2), {
        sourcePosition: { x: 20, y: 10 },
        targetPosition: { x: 20, y: targetBox!.height - 10 },
      });
      await expect(post1.locator('.photo-card-name')).toHaveText(['a.svg', 'b.svg', 'c.svg']);
    } else {
      await page.getByRole('button', { name: '往前移 c.svg', exact: true }).click();
      await expect(post1.locator('.photo-card-name')).toHaveText(['a.svg', 'c.svg', 'b.svg']);
    }
    await page.getByRole('button', { name: /復原上一步/ }).click();
    await page.getByLabel('移動 b.svg 至貼文').selectOption('post-2');
    await expect(page.locator('[data-post-id=post-2] .photo-card-name')).toHaveText(['b.svg']);
    await page.getByRole('button', { name: /按時間均分/ }).click();
    await page.getByRole('button', { name: '保留目前排版' }).click();
    await expect(page.locator('[data-post-id=post-2] .photo-card-name')).toHaveText(['b.svg']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`curator-${width}.png`), fullPage: true });
  });
}
