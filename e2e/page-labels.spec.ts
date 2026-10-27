import { expect, test } from '@playwright/test';
import { LABELLED_FIXTURE_PDF } from './support/paths';
import { addNote, importFixture } from './support/reader';

test.beforeEach(async ({ page }) => importFixture(page, LABELLED_FIXTURE_PDF));

test('printed labels and explicit PDF page numbers navigate to different pages', async ({ page }) => {
  const field = page.locator('#page-field');
  await expect(field).toHaveValue('i');
  await expect(page.locator('.page-field__total')).toHaveText('(1 of 36)');
  await field.fill('#2');
  await field.press('Enter');
  await expect(field).toHaveValue('ii');
  await expect(page.locator('.page-field__total')).toHaveText('(2 of 36)');
  await field.fill('5');
  await field.press('Enter');
  await expect(field).toHaveValue('5');
  await expect(page.locator('.page-field__total')).toHaveText('(7 of 36)');
  await expect(page.locator('.page-sheet[data-page="7"] canvas')).toBeVisible();
  await field.fill('#5');
  await field.press('Enter');
  await expect(field).toHaveValue('3');
  await expect(page.locator('.page-field__total')).toHaveText('(5 of 36)');
  await expect(page.locator('.page-sheet[data-page="5"] canvas')).toBeVisible();
});

test('outline, bookmark and review show printed page labels', async ({ page }) => {
  const chapter = page.locator('.outline__item').filter({ hasText: "Chapter 2: Newton's Laws" });
  await expect(chapter.locator('.outline__page')).toHaveText('9');
  const field = page.locator('#page-field');
  await field.fill('5');
  await field.press('Enter');
  await expect(page.locator('.page-sheet[data-page="7"] canvas')).toBeVisible();
  await expect(page.locator('.page-field__total')).toHaveText('(7 of 36)');
  await page.keyboard.press('b');
  await page.getByRole('tab', { name: 'Bookmarks' }).click();
  await expect(page.locator('.bookmark-list__page')).toHaveText('5');
  await addNote(page, 'Labelled page note');
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('Shift+R');
  await expect(page.locator('.review-row__page')).toHaveText('Page 5');
  await expect(page.locator('.review-row')).toContainText('Labelled page note');
});
