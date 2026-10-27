import { expect, test } from '@playwright/test';
import { STRESS_PDF } from './support/paths';
import { goToPage } from './support/reader';

test('large PDF renders middle and last pages with bounded canvases', async ({ page }) => {
  test.skip(!STRESS_PDF, 'Set SCRIPTORIUM_STRESS_PDF to a local large PDF.');
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(STRESS_PDF!);
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  const total = Number((await page.locator('.page-field__total').innerText()).replace(/\D/g, ''));
  expect(total).toBeGreaterThan(36);
  for (const number of [Math.ceil(total / 2), total]) {
    await goToPage(page, number);
    await expect.poll(() => page.locator('canvas').count()).toBeLessThanOrEqual(6);
  }
});
