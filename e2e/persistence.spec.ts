import { expect, test } from '@playwright/test';
import {
  backToLibrary,
  goToPage,
  importFixture,
  openAppearance,
  waitForProgressSave,
} from './support/reader';

test('page, intra-page offset and zoom survive reload and library continuation', async ({ page }) => {
  await importFixture(page);
  await goToPage(page, 11);
  await page.locator('.reader__viewport').evaluate((viewport) => {
    viewport.scrollTop += 180;
  });
  const sheet = page.locator('.page-sheet[data-page="11"]');
  const offset = async () =>
    sheet.evaluate((element) => {
      const viewport = element.closest('.reader__viewport')!;
      return (
        (viewport.getBoundingClientRect().top - element.getBoundingClientRect().top) /
        element.getBoundingClientRect().height
      );
    });
  await expect.poll(offset).toBeGreaterThan(0.1);
  await openAppearance(page);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoom = await page.getByRole('button', { name: /^Zoom level/ }).innerText();
  const savedOffset = await offset();
  await waitForProgressSave(page);
  await page.reload();
  await expect(page.locator('#page-field')).toHaveValue('11');
  await expect(sheet.locator('canvas')).toBeVisible();
  await openAppearance(page);
  await expect(page.getByRole('button', { name: /^Zoom level/ })).toHaveText(zoom);
  await expect.poll(async () => Math.abs((await offset()) - savedOffset)).toBeLessThan(0.03);
  await backToLibrary(page);
  await page.getByRole('button', { name: 'Continue reading' }).click();
  await expect(page.locator('#page-field')).toHaveValue('11');
  await expect(sheet.locator('canvas')).toBeVisible();
  await openAppearance(page);
  await expect(page.getByRole('button', { name: /^Zoom level/ })).toHaveText(zoom);
  await expect.poll(async () => Math.abs((await offset()) - savedOffset)).toBeLessThan(0.03);
});

test('dark theme and page inversion persist after reload', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.getByRole('switch', { name: /Invert page colours/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader')).toHaveClass(/invert-pages/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader')).toHaveClass(/invert-pages/);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect(page.getByRole('switch', { name: /Invert page colours/ })).toBeChecked();
  await page.getByRole('switch', { name: /Invert page colours/ }).uncheck();
  await expect(page.locator('.reader')).not.toHaveClass(/invert-pages/);
  await page.getByRole('radio', { name: 'Sepia' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('progress is saved on a hidden visibility change', async ({ page, context }) => {
  await importFixture(page);
  const library = await context.newPage();
  await library.goto('/');
  await page.bringToFront();
  await page.locator('#page-field').fill('11');
  await page.locator('#page-field').press('Enter');
  await expect(page.locator('#page-field')).toHaveValue('11');
  // Headless Chromium keeps both tabs visible; simulate the browser's hidden event.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(async () => {
      await library.reload();
      return library.getByText('Page 11 of 36', { exact: false }).count();
    })
    .toBe(1);
});
