import { expect, test, type Page } from '@playwright/test';
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

const PHRASE = '1.1 Position and Displacement';
const NOTE = 'Remember the sign convention';

async function highlightPhrase(page: Page, pageNumber: number): Promise<void> {
  const span = page
    .locator(`.page-sheet[data-page="${pageNumber}"] .textLayer span`)
    .filter({ hasText: PHRASE })
    .first();
  await expect(span).toBeVisible();
  await span.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole('button', { name: 'Highlight Sage' }).click();
  await expect(page.locator('.page-highlight[data-note-color="sage"]').first()).toBeVisible();
}

async function openStorageDialog(page: Page) {
  await page.getByRole('button', { name: 'Library and storage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Library & storage' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function deleteBrowserData(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('scriptorium');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
  await page.reload();
}

test('a backup brings notes, highlights, bookmarks and progress back after browser data is wiped', async ({
  page,
}, testInfo) => {
  await importFixture(page);
  await goToPage(page, 3);
  await highlightPhrase(page, 3);
  await page.keyboard.press('b');
  await expect(page.locator('.page-sheet[data-page="3"] .page-sheet__ribbon')).toBeVisible();
  await addNote(page, NOTE);
  await waitForProgressSave(page);
  await backToLibrary(page);

  const dialog = await openStorageDialog(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Export backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Scriptorium backup \d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = testInfo.outputPath('backup.json');
  await download.saveAs(backupPath);
  await expect(page.getByText(/^Backup saved — 1 book, 1 note, 1 highlight, 1 bookmark$/)).toBeVisible();

  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(backup.format).toBe('scriptorium.backup');
  expect(backup.books).toHaveLength(1);
  expect(backup.books[0].book.title).toBe(TITLE);
  expect(backup.books[0].data.notes.map((note: { text: string }) => note.text)).toEqual([NOTE]);
  expect(backup.books[0].data.highlights).toHaveLength(1);
  expect(backup.books[0].data.bookmarks).toHaveLength(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await deleteBrowserData(page);
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();

  const restoreDialog = await openStorageDialog(page);
  await restoreDialog.getByLabel('Choose a backup file').setInputFiles(backupPath);
  await expect(restoreDialog.getByText('Restored notes for 1 book.')).toBeVisible();
  await expect(restoreDialog.getByText('Add these PDFs to see their notes:')).toBeVisible();
  await expect(restoreDialog.getByRole('listitem').filter({ hasText: TITLE })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();

  await page.locator('input[type=file]').setInputFiles(FIXTURE_PDF);
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
  await expect(page.locator('#page-field')).toHaveValue('3');
  await expect(page.locator('.page-sheet[data-page="3"] .page-sheet__ribbon')).toBeVisible();
  await expect(page.locator('.page-highlight[data-note-color="sage"]').first()).toBeVisible();
  await expect(page.locator('.margin-note').filter({ hasText: NOTE })).toBeVisible();
});

test('restoring a file that is not a backup changes nothing and says why', async ({ page }) => {
  await importFixture(page);
  await backToLibrary(page);
  const dialog = await openStorageDialog(page);
  await dialog.getByLabel('Choose a backup file').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(dialog.getByText('That file isn’t a Scriptorium backup.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.book-card')).toHaveCount(1);
});

test('exporting an empty library does not download a file', async ({ page }) => {
  await page.goto('/');
  const dialog = await openStorageDialog(page);
  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });
  await dialog.getByRole('button', { name: 'Export backup' }).click();
  await expect(dialog.getByText('There’s nothing to back up yet.')).toBeVisible();
  expect(downloaded).toBe(false);
});
