import { expect, test } from '@playwright/test';
import { visitorFixture } from './visitor-fixture';

test('a visitor thought opens on a tap and closes through its accessible button', async ({
  page,
}) => {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error('The visitor test needs a fixed viewport.');
  }
  const fixture = await visitorFixture(viewport.width, viewport.height);
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error) => problems.push(error.message));
  await page.addInitScript({
    content: `(() => {
      const request = indexedDB.open('zoo-refuge', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('texts');
        store.put(${JSON.stringify(fixture.save)}, 'save.copy.1');
      };
      request.onsuccess = () => request.result.close();
    })();`,
  });
  await page.goto('/?quality=low');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('#app canvas');
  const bounds = await canvas.boundingBox();
  if (bounds === null) {
    throw new Error('The park canvas must be visible.');
  }
  const close = page.getByRole('button', { name: 'Fermer la pensée du visiteur' });
  await canvas.click({ position: fixture.tap });
  await expect(close).toBeVisible();
  await expect(page.getByText(fixture.thought, { exact: true })).toBeVisible();
  await close.click();
  await expect(close).toBeHidden();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await expect(close).toBeHidden();
  expect(problems).toEqual([]);
});
