import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { FIXTURE_PDF } from './support/paths';
import {
  addNote,
  backToLibrary,
  goToPage,
  importFixture,
  TITLE,
  waitForProgressSave,
} from './support/reader';

test('empty library and invalid import report an error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'not-a-book.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a PDF'),
  });
  await expect(page.getByRole('alert')).toContainText('Nothing was added');
  await expect(page.locator('.book-card')).toHaveCount(0);
});

test('import, progress, duplicate import, and confirmed removal', async ({ page }) => {
  await importFixture(page);
  await goToPage(page, 11);
  await waitForProgressSave(page);
  await backToLibrary(page);
  const card = page.locator('.book-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(TITLE);
  await expect(card.getByRole('button', { name: /Open .*% read/ })).not.toHaveAttribute(
    'aria-label',
    /0% read/,
  );
  await expect(card.locator('img')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue reading' })).toBeVisible();

  await page.locator('input[type=file]').setInputFiles(FIXTURE_PDF);
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
  await backToLibrary(page);
  await expect(card).toHaveCount(1);
  await page.getByRole('button', { name: `More options for ${TITLE}` }).click();
  await page.getByRole('button', { name: 'Remove from library…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toHaveCount(1);
  await page.getByRole('button', { name: `More options for ${TITLE}` }).click();
  await page.getByRole('button', { name: 'Remove from library…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();
});

test('dropping a PDF imports and opens it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();
  const bytes = (await readFile(FIXTURE_PDF)).toString('base64');
  await page.evaluate((base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([data], 'sample-textbook.pdf', { type: 'application/pdf' }));
    window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, bytes);
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
});

test('cancel retains book data; confirmed removal deletes it', async ({ page }) => {
  await importFixture(page);
  await goToPage(page, 6);
  await page.keyboard.press('b');
  await addNote(page, 'Data to remove');
  await waitForProgressSave(page);
  await backToLibrary(page);
  await page.getByRole('button', { name: `More options for ${TITLE}` }).click();
  await page.getByRole('button', { name: 'Remove from library…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Continue reading' }).click();
  await expect(page.locator('#page-field')).toHaveValue('6');
  await expect(page.locator('.page-sheet[data-page="6"] .page-sheet__ribbon')).toBeVisible();
  await expect(page.locator('.margin-note').filter({ hasText: 'Data to remove' })).toBeVisible();
  await backToLibrary(page);
  await page.getByRole('button', { name: `More options for ${TITLE}` }).click();
  await page.getByRole('button', { name: 'Remove from library…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(FIXTURE_PDF);
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator('#page-field')).toHaveValue('1');
  await goToPage(page, 6);
  await expect(page.locator('.page-sheet[data-page="6"] .page-sheet__ribbon')).toHaveCount(0);
  await expect(page.locator('.margin-note')).toHaveCount(0);
});
