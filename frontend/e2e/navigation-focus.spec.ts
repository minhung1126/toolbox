import { test, expect } from '@playwright/test';
import { mockAuthenticatedBackend } from './fixtures';

interface FocusTraceEntry {
  type: string;
  time: number;
  key: string;
  shift: boolean;
  active: string | undefined;
  target: string | null;
}

type FocusWindow = Window & { __focusTrace: FocusTraceEntry[] };

test('drawer traps keyboard focus during its opening animation', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const win = window as unknown as FocusWindow;
    win.__focusTrace = [];
    for (const type of ['keydown', 'focusin', 'focusout'])
      document.addEventListener(
        type,
        (event) => {
          const active = document.activeElement as HTMLElement;
          win.__focusTrace.push({
            type,
            time: performance.now(),
            key: (event as KeyboardEvent).key,
            shift: (event as KeyboardEvent).shiftKey,
            active: active?.getAttribute('aria-label') || active?.textContent?.trim().slice(0, 50),
            target: (event.target as HTMLElement)?.getAttribute('aria-label'),
          });
        },
        true
      );
  });
  await mockAuthenticatedBackend(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: '收起側邊選單' }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: '開啟導覽選單' }).click();
  const close = page.getByRole('complementary', { name: '主要導覽' }).getByRole('button', { name: '關閉導覽選單' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  try {
    await expect(page.getByRole('button', { name: '登出控制台' })).toBeFocused();
  } finally {
    await testInfo.attach('focus-events.json', {
      body: JSON.stringify(await page.evaluate(() => (window as unknown as FocusWindow).__focusTrace)),
      contentType: 'application/json',
    });
  }
});
