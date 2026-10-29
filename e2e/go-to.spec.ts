import { expect, test } from '@playwright/test';
import { addNote, goToPage, importFixture } from './support/reader';

test.beforeEach(async ({ page }) => importFixture(page));

test('G navigates to a page and restores focus on Escape', async ({ page }) => {
  const viewport = page.locator('.reader__viewport');
  await viewport.focus();
  await page.keyboard.press('g');
  const dialog = page.getByRole('dialog', { name: 'Go to' });
  const input = dialog.getByRole('combobox');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-keyshortcuts', 'G');
  await input.fill('15');
  await expect(dialog.getByRole('option').first()).toContainText('Go to p. 15');
  await input.press('Enter');
  await expect(page.locator('#page-field')).toHaveValue('15');
  await expect(page.locator('.return-pill')).toContainText('1');
  await viewport.focus();
  await page.keyboard.press('g');
  await input.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(viewport).toBeFocused();
  await page.keyboard.press('g');
  await dialog.getByRole('button', { name: 'Close Go to' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(viewport).toBeFocused();
});

test('finds chapters and notes and leaves typing alone', async ({ page }) => {
  await goToPage(page, 15);
  await addNote(page, 'Centripetal acceleration reminder');
  await goToPage(page, 1);
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('g');
  const dialog = page.getByRole('dialog', { name: 'Go to' });
  const input = dialog.getByRole('combobox');
  await input.fill("Newton's Laws");
  await dialog.getByRole('option', { name: /Chapter 2: Newton's Laws/ }).click();
  await expect(page.locator('#page-field')).toHaveValue('11');
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('g');
  await input.fill('centripetal acceleration');
  await dialog.getByRole('option', { name: /Centripetal acceleration reminder/ }).click();
  await expect(page.locator('#page-field')).toHaveValue('15');
  await expect(page.locator('.return-pill')).toContainText('11');

  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('n');
  const editor = page.getByRole('textbox', { name: /Note text, page/ });
  await expect(editor).toBeFocused();
  await editor.press('g');
  await expect(editor).toHaveText('g');
  await expect(dialog).not.toBeVisible();
});

test('last resort searches the book and actions can be chosen by keyboard', async ({ page }) => {
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('g');
  const dialog = page.getByRole('dialog', { name: 'Go to' });
  const input = dialog.getByRole('combobox');
  await input.fill('trajectory');
  await dialog.getByRole('option', { name: 'Search the book for “trajectory”' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search in book' })).toHaveValue('trajectory');
  await expect(page.getByRole('tab', { name: 'Search' })).toHaveAttribute('aria-selected', 'true');
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('g');
  await input.fill('reading ruler');
  await input.press('Enter');
  await page.keyboard.press('g');
  await input.fill('reading ruler');
  await expect(dialog.getByRole('option', { name: /Hide reading ruler/ })).toBeVisible();
});
