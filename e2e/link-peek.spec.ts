import { expect, test } from '@playwright/test';
import { goToPage, importFixture } from './support/reader';

test.beforeEach(async ({ page }) => {
  await importFixture(page);
  await goToPage(page, 15);
});

test('hover opens a rendered peek and Go to navigates with Return', async ({ page }) => {
  await page.getByRole('link', { name: 'Go to page 7', exact: true }).hover();
  const peek = page.getByRole('dialog', { name: 'Preview of page 7' });
  await expect(peek).toBeVisible();
  await expect(peek.locator('canvas')).toBeVisible();
  await peek.getByRole('button', { name: 'Go to page 7' }).click();
  await expect(page.locator('#page-field')).toHaveValue('7');
  await expect(page.locator('.page-sheet[data-page="7"] canvas')).toBeVisible();
  await expect(page.locator('.return-pill')).toContainText('15');
  await expect(peek).toHaveCount(0);
});

test('Escape and moving the pointer away dismiss a hover peek', async ({ page }) => {
  const link = page.getByRole('link', { name: 'Go to page 7', exact: true });
  const peek = page.getByRole('dialog', { name: 'Preview of page 7' });
  await link.hover();
  await expect(peek).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(peek).toHaveCount(0);
  await page.getByRole('toolbar', { name: 'Reader' }).hover();
  await link.hover();
  await expect(peek).toBeVisible();
  await page.getByRole('toolbar', { name: 'Reader' }).hover();
  await expect(peek).toHaveCount(0);
  await expect(page.locator('#page-field')).toHaveValue('15');
});

test('clicking the link directly still navigates', async ({ page }) => {
  await page.getByRole('link', { name: 'Go to page 7', exact: true }).click();
  await expect(page.locator('#page-field')).toHaveValue('7');
  await expect(page.locator('.return-pill')).toContainText('15');
});
