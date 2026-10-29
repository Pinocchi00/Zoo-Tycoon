import { expect, test } from '@playwright/test';

/** Console message types that mean something went wrong while booting. */
const FORBIDDEN_CONSOLE_TYPES = new Set(['error', 'warning', 'assert']);

test('the game boots without any console error or warning', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (FORBIDDEN_CONSOLE_TYPES.has(message.type())) {
      problems.push(`[console.${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`[uncaught] ${error.message}`);
  });

  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('canvas, #app').first()).toBeAttached();
  await expect(page.locator('#app canvas')).toBeVisible();
  expect(problems).toEqual([]);
});
