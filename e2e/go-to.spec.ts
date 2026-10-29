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

test('finds words in the text, and actions can be chosen by keyboard', async ({ page }) => {
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('g');
  const dialog = page.getByRole('dialog', { name: 'Go to' });
  const input = dialog.getByRole('combobox');
  await input.fill('trajectory');
  const text = dialog.getByRole('group', { name: /^In the text/ });
  await expect(text.getByRole('option').first().locator('mark')).toHaveText(/^trajectory$/i);
  // Closing without choosing a match ends the search.
  await input.press('Escape');
  await page.keyboard.press('g');
  await expect(input).toHaveValue('');
  await input.fill('reading ruler');
  await input.press('Enter');
  await page.keyboard.press('g');
  await input.fill('reading ruler');
  await expect(dialog.getByRole('option', { name: /Hide reading ruler/ })).toBeVisible();
});
