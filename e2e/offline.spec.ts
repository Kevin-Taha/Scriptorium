import { expect, test } from '@playwright/test';
import { backToLibrary, importFixture, TITLE } from './support/reader';

test.use({ serviceWorkers: 'allow' });

test('the library and an imported book open offline once the app is cached', async ({ page, context }) => {
  await importFixture(page);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();

  await backToLibrary(page);
  await expect(page.getByRole('heading', { name: TITLE }).first()).toBeVisible();
});
