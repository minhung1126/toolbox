import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { mockAuthenticatedBackend } from './fixtures';

async function dragPhoto(page: Page, source: Locator, target: Locator, edge: 'before' | 'after') {
  const grip = source.locator('.photo-drag-grip');
  await grip.hover();
  const start = (await grip.boundingBox())!;
  await page.mouse.down();
  try {
    await page.mouse.move(start.x + start.width / 2 + 8, start.y + start.height / 2, { steps: 3 });
    // Start the native drag before scrolling to its destination.
    await expect(source).toHaveClass(/is-dragging/);
    const targetAnchor = target.locator(edge === 'before' ? '.photo-drag-grip' : '.photo-card-name');
    await targetAnchor.scrollIntoViewIfNeeded();
    const end = (await targetAnchor.boundingBox())!;
    const x = end.x + end.width / 2;
    const y = end.y + end.height / 2;
    await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.move(x + 1, y + 1);
    await expect(target).toHaveClass(new RegExp(`drop-${edge}`));
  } finally {
    await page.mouse.up();
  }
}

test('switching tools preserves local photos, grouping and titles', async ({ page }) => {
  await mockAuthenticatedBackend(page);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/photo-curator');
  await page.getByRole('button', { name: '9 格', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'retained.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>'),
  });
  await page.getByRole('button', { name: '+ P9', exact: true }).click();
  await page.getByLabel('Post 9 主題名稱').fill('旅行照片');
  await page.getByRole('button', { name: '開啟導覽選單' }).click();
  await page.locator('.sidebar a[href="/dashboard"]').click();
  await expect(page.getByRole('heading', { name: 'Toolbox 控制台' })).toBeVisible();
  await page.getByRole('button', { name: '開啟導覽選單' }).click();
  await page.locator('.sidebar a[href="/photo-curator"]').click();
  await expect(page.getByRole('button', { name: '9 格', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.post-column-card')).toHaveCount(9);
  await expect(page.getByLabel('Post 9 主題名稱')).toHaveValue('旅行照片');
  await expect(page.locator('[data-post-id=post-9] .photo-card-name')).toHaveText(['retained.svg']);
  await expect(page.locator('[data-post-id=post-9] img').first()).toHaveJSProperty('complete', true);
});

for (const width of [390, 768, 1440]) {
  test(`3, 6 and 9 grid presets keep previews and quick assignment within ${width}px`, async ({ page }, testInfo) => {
    await mockAuthenticatedBackend(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/photo-curator');
    await page.locator('input[type=file]').setInputFiles({
      name: 'pending.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="indigo"/></svg>'
      ),
    });

    for (const count of [3, 6, 9]) {
      const button = page.getByRole('button', { name: `${count} 格`, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.post-column-card')).toHaveCount(count);
      await expect(page.locator('.btn-quick-assign')).toHaveCount(count);
      await expect(page.locator('.ig-slot-badge')).toHaveText(
        Array.from({ length: count }, (_, index) => `Post ${count - index} 封面`)
      );
      const columns = await page
        .locator('.ig-preview-grid')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
      expect(columns).toBe(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        1
      );
    }

    await page.locator('.photo-curator-toolbar').screenshot({ path: testInfo.outputPath(`grid-presets-${width}.png`) });
    await page.getByRole('button', { name: '+ P9', exact: true }).click();
    await expect(page.getByAltText('Post 9 封面：pending.svg')).toBeVisible();
    await page
      .locator('.ig-preview-section')
      .screenshot({ path: testInfo.outputPath(`nine-grid-preview-${width}.png`) });
    await page.getByRole('button', { name: '3 格', exact: true }).click();
    await expect(page.locator('.pool-photo-list .photo-card-name')).toHaveText(['pending.svg']);
    await page.getByRole('button', { name: /復原上一步/ }).click();
    await expect(page.locator('[data-post-id=post-9] .photo-card-name')).toHaveText(['pending.svg']);
    await expect(page.getByAltText('Post 9 封面：pending.svg')).toBeVisible();
  });
}

for (const count of [6, 9]) {
  test(`exports all ${count} post folders and their cover images`, async ({ page }) => {
    await mockAuthenticatedBackend(page);
    await page.goto('/photo-curator');
    await page.getByRole('button', { name: `${count} 格`, exact: true }).click();
    const files = Array.from({ length: count }, (_, index) => ({
      name: `photo-${index + 1}.svg`,
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="50">${index + 1}</text></svg>`
      ),
    }));
    await page.locator('input[type=file]').setInputFiles(files);
    for (let index = 1; index <= count; index += 1) {
      await page
        .getByRole('button', { name: `+ P${index}`, exact: true })
        .first()
        .click();
    }

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '下載分組照片 (ZIP)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^Instagram_${count}格貼文_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.zip$`)
    );
    const archive = await JSZip.loadAsync(await readFile((await download.path())!));
    const checklist = await archive.file('貼文發布對照清單_Checklist.txt')?.async('string');
    expect(checklist).toContain(`排版格數：${count} 格`);
    for (let index = 1; index <= count; index += 1) {
      const photo = archive.file(`Post_${index}_Post ${index}/01_COVER_photo-${index}.svg`);
      expect(photo).not.toBeNull();
      expect(await photo!.async('nodebuffer')).toEqual(files[index - 1].buffer);
      expect(checklist).toContain(`photo-${index}.svg [★ 首圖 Cover]`);
    }
  });
}

for (const width of [390, 1440]) {
  test(`photo grouping and precise sorting at ${width}px`, async ({ page }) => {
    await mockAuthenticatedBackend(page);
    // Keep the larger photo cards visible together during pointer-based sorting.
    await page.setViewportSize({ width, height: width === 1440 ? 1600 : 1000 });
    await page.goto('/photo-curator');
    await page.locator('input[type=file]').setInputFiles(
      ['a', 'b', 'c', 'unassigned'].map((name) => ({
        name: `${name}.svg`,
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="indigo"/></svg>'
        ),
      }))
    );
    const slider = page.getByRole('slider', { name: '縮圖大小', exact: true });
    const poolThumbnail = page.locator('.pool-photo-list .photo-card-thumb-wrap').first();
    await expect(slider).toHaveValue('1');
    await expect(poolThumbnail).toHaveCSS('width', '64px');
    await expect(poolThumbnail).toHaveCSS('height', '64px');

    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ P1', exact: true }).first().click();
    await expect(page.locator('.ig-slot-badge')).toHaveText(['Post 3 封面', 'Post 2 封面', 'Post 1 封面']);
    const post1 = page.locator('[data-post-id=post-1]');
    const cards = post1.locator('.post-item-card');
    const thumbnail = cards.first().locator('.photo-card-thumb-wrap');
    const coverPreview = page.locator('.ig-slot-image-box').first();
    const previewSize = await coverPreview.evaluate((element) => ({
      width: getComputedStyle(element).width,
      height: getComputedStyle(element).height,
    }));
    const sizes = [
      { label: '最小', pixels: 40 },
      { label: '小', pixels: 64 },
      { label: '中', pixels: 96 },
      { label: '大', pixels: 144 },
      { label: '最大', pixels: 192 },
    ];
    for (const [index, size] of sizes.entries()) {
      const sizeButton = page.getByRole('button', { name: `${size.label}縮圖`, exact: true });
      await sizeButton.click();
      await expect(slider).toHaveValue(String(index));
      await expect(sizeButton).toHaveAttribute('aria-pressed', 'true');
      await expect(thumbnail).toHaveCSS('width', `${size.pixels}px`);
      await expect(thumbnail).toHaveCSS('height', `${size.pixels}px`);
      await expect(poolThumbnail).toHaveCSS('width', `${size.pixels}px`);
      await expect(poolThumbnail).toHaveCSS('height', `${size.pixels}px`);
      await expect(coverPreview).toHaveCSS('width', previewSize.width);
      await expect(coverPreview).toHaveCSS('height', previewSize.height);
      await expect(post1.locator('.photo-card-name')).toHaveText(['a.svg', 'b.svg', 'c.svg']);
      await expect(cards.first()).toHaveClass(/is-cover-item/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await slider.focus();
    await slider.press('Home');
    await expect(slider).toHaveValue('0');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('1');
    await slider.press('End');
    await expect(slider).toHaveValue('4');
    await expect(thumbnail).toHaveCSS('width', '192px');

    if (width === 1440) {
      await dragPhoto(page, cards.nth(2), cards.nth(0), 'before');
      await expect(post1.locator('.photo-card-name')).toHaveText(['c.svg', 'a.svg', 'b.svg']);
      await expect(cards.first()).toHaveClass(/is-cover-item/);
      await expect(page.locator('.ig-grid-slot').last().locator('img')).toHaveAttribute('alt', /c.svg/);
      await dragPhoto(page, cards.first(), cards.nth(2), 'after');
      await expect(post1.locator('.photo-card-name')).toHaveText(['a.svg', 'b.svg', 'c.svg']);
    } else {
      await page.getByRole('button', { name: '往前移 c.svg', exact: true }).click();
      await expect(post1.locator('.photo-card-name')).toHaveText(['a.svg', 'c.svg', 'b.svg']);
    }
    await page.getByRole('button', { name: '最小縮圖', exact: true }).click();
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
