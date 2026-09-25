import { expect, test } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

test('FFmpeg editing preserves filenames and updates trim, encoding and shell commands', async ({ page }) => {
  await mockAuthenticatedBackend(page);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/ffmpeg-generator');

  const command = page.getByRole('region', { name: 'FFmpeg 命令行與複製' }).locator('pre code');
  await page.getByLabel('輸入檔名').fill('演唱會 source.mp4');
  await page.getByLabel('輸出檔名').fill('clip final.mp4');
  await page.getByLabel('剪輯起始時間', { exact: true }).fill('00:00:02.000');
  await page.getByLabel('剪輯結束時間或長度').fill('00:00:08.000');
  await expect(command).toHaveText(
    'ffmpeg -ss 00:00:02.000 -i "演唱會 source.mp4" -to 00:00:08.000 -c copy "clip final.mp4"'
  );

  await page.getByRole('button', { name: 'H.264 高相容' }).click();
  await page.getByLabel('解析度縮放').selectOption('720p');
  await page.getByLabel('影格率 (FPS)').selectOption('30');
  await page.getByLabel('音訊編碼器 (-c:a)').selectOption('none');
  await expect(page.getByLabel('音訊碼率 (-b:a)')).toBeDisabled();
  await expect(command).toContainText('-c:v libx264');
  await expect(command).toContainText('scale=1280:720');
  await expect(command).toContainText('fps=30');
  await expect(command).toContainText('-an');

  await page.getByRole('button', { name: 'PowerShell', exact: false }).click();
  await expect(command).toContainText(/ffmpeg `\n/);
  await page.getByRole('button', { name: 'CMD ( ^ )', exact: true }).click();
  await expect(command).toContainText(/ffmpeg \^\n/);
  await page.getByRole('button', { name: '單行指令', exact: true }).click();
  await expect(command).not.toContainText(/\n/);

  await page.getByRole('button', { name: '擷取 MP3 音訊' }).click();
  await expect(page.getByLabel('輸出檔名')).toHaveValue('clip final.mp3');
  await expect(command).toContainText('-vn -c:a libmp3lame -b:a 192k');
  await page.getByRole('button', { name: '動態 GIF 圖片' }).click();
  await expect(page.getByLabel('輸出檔名')).toHaveValue('clip final.gif');
  await expect(command).toContainText('palettegen');
  await expect(page.getByLabel('輸入檔名')).toHaveValue('演唱會 source.mp4');
});
