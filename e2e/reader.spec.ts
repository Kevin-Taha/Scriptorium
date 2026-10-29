import { expect, test } from '@playwright/test';
import { goToPage, importFixture } from './support/reader';

test.beforeEach(async ({ page }) => importFixture(page));

test('scrolling updates the page and G navigates; invalid pages do not navigate', async ({ page }) => {
  await expect(page.locator('.page-field__total')).toHaveText('/ 36');
  await page.locator('.reader__viewport').evaluate((viewport) => {
    viewport.scrollTop += viewport.clientHeight * 1.8;
  });
  await expect.poll(async () => Number(await page.locator('#page-field').inputValue())).toBeGreaterThan(1);
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('g');
  const input = page.getByRole('combobox', { name: /Go to/ });
  await expect(input).toBeFocused();
  await input.fill('15');
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-field')).toHaveValue('15');
  await expect(page.locator('.page-sheet[data-page="15"] canvas')).toBeVisible();
  await page.locator('#page-field').fill('37');
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-field')).toHaveValue('15');
});

test('toolbar and keyboard zoom preserve the current page', async ({ page }) => {
  await goToPage(page, 11);
  const zoom = page.getByRole('button', { name: /^Zoom level/ });
  const initial = await zoom.innerText();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(zoom).not.toHaveText(initial);
  await expect(page.locator('#page-field')).toHaveValue('11');
  const enlarged = await zoom.innerText();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(zoom).not.toHaveText(enlarged);
  await zoom.click();
  await page.getByRole('menuitemradio', { name: 'Fit width' }).click();
  await expect(page.locator('#page-field')).toHaveValue('11');
  const fitted = await zoom.innerText();
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('+');
  await expect(zoom).not.toHaveText(fitted);
  const keyboardZoom = await zoom.innerText();
  await page.keyboard.press('-');
  await expect(zoom).not.toHaveText(keyboardZoom);
  await page.keyboard.press('0');
  await expect(zoom).toHaveText(fitted);
  await expect(page.locator('#page-field')).toHaveValue('11');
});

test('selectable PDF text and an internal XYZ link', async ({ page }) => {
  await goToPage(page, 15);
  const text = page.locator('.page-sheet[data-page="15"] .textLayer span').filter({
    hasText: 'For the trajectory',
  });
  await expect(text).toBeVisible();
  const selected = await text.evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(selected.length).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Go to page 7', exact: true }).click();
  await expect(page.locator('#page-field')).toHaveValue('7');
  await expect(page.locator('.page-sheet[data-page="7"] canvas')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.page-sheet[data-page="7"]').evaluate((sheet) => {
        const viewport = sheet.closest('.reader__viewport')!;
        return (
          (viewport.getBoundingClientRect().top - sheet.getBoundingClientRect().top) /
          sheet.getBoundingClientRect().height
        );
      }),
    )
    .toBeCloseTo((792 - 560) / 792, 1);
  await expect(page.locator('.return-pill')).toContainText('15');
});
