import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { focusApp, ownDeviceId, readFolderFile, stubFolderPicker, writeFolderFile } from './support/folder';
import { FIXTURE_PDF } from './support/paths';
import {
  addNote,
  backToLibrary,
  goToPage,
  importFixture,
  TITLE,
  waitForProgressSave,
} from './support/reader';

const card = (page: Page) => page.locator('.book-card');
const menuButton = (page: Page) => page.getByRole('button', { name: `More options for ${TITLE}` });
const resetDialog = (page: Page) => page.getByRole('dialog', { name: `Reset “${TITLE}”?` });

async function openResetDialog(page: Page): Promise<void> {
  await menuButton(page).click();
  await page.getByRole('button', { name: 'Reset progress…' }).click();
  await expect(resetDialog(page)).toBeVisible();
}

async function highlightPhrase(page: Page, pageNumber: number, phrase: string): Promise<void> {
  const span = page
    .locator(`.page-sheet[data-page="${pageNumber}"] .textLayer span`)
    .filter({ hasText: phrase })
    .first();
  await expect(span).toBeVisible();
  await span.evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole('button', { name: 'Highlight Sage' }).click();
  await expect(page.locator(`.page-sheet[data-page="${pageNumber}"] .page-highlight`).first()).toBeVisible();
}

test('Reset progress wipes a book’s notes, highlights, bookmarks and position, and keeps the book', async ({
  page,
}) => {
  await importFixture(page);
  await goToPage(page, 14);
  await highlightPhrase(page, 14, '2.2 The Second Law');
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('b');
  await expect(page.locator('.page-sheet[data-page="14"] .page-sheet__ribbon')).toBeVisible();
  await addNote(page, 'A note to lose');
  await waitForProgressSave(page);
  await backToLibrary(page);
  await expect(page.getByRole('button', { name: 'Continue reading' })).toBeVisible();
  await expect(card(page).getByRole('button', { name: /^Open .*, [1-9]\d?% read/ })).toBeVisible();

  // Cancel keeps everything.
  await openResetDialog(page);
  await expect(resetDialog(page)).toContainText('deletes 1 note, 1 highlight and 1 bookmark.');
  await expect(resetDialog(page)).not.toContainText('Other devices');
  await expect(resetDialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await resetDialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(resetDialog(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Continue reading' })).toBeVisible();
  await expect(card(page).getByRole('button', { name: /^Open .*, 0% read/ })).toHaveCount(0);

  await openResetDialog(page);
  await resetDialog(page).getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(resetDialog(page)).toHaveCount(0);
  await expect(page.locator('.toast').filter({ hasText: `Reset “${TITLE}”` })).toBeVisible();
  await expect(menuButton(page)).toBeFocused();
  await expect(card(page)).toHaveCount(1);
  await expect(card(page).getByRole('button', { name: /^Open .*, 0% read/ })).toBeVisible();
  await expect(card(page)).toContainText('Not opened yet');
  await expect(page.getByRole('region', { name: 'Pick up where you left off' })).toHaveCount(0);

  // The reset is saved, not just shown.
  await page.reload();
  await expect(card(page).getByRole('button', { name: /^Open .*, 0% read/ })).toBeVisible();
  await expect(card(page)).toContainText('Not opened yet');

  await card(page)
    .getByRole('button', { name: /^Open / })
    .click();
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator('#page-field')).toHaveValue('1');
  await goToPage(page, 14);
  await expect(page.locator('.page-highlight')).toHaveCount(0);
  await expect(page.locator('.page-sheet__ribbon')).toHaveCount(0);
  await expect(page.locator('.margin-note')).toHaveCount(0);
  await page.keyboard.press('Shift+R');
  await expect(page.getByRole('heading', { name: 'Nothing to review yet' })).toBeVisible();
  await page.keyboard.press('Shift+R');

  // The book itself is untouched: still in the library, readable, with its contents.
  await backToLibrary(page);
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toContainText(TITLE);
});

test('Reset progress is there for a book that has nothing to lose', async ({ page }) => {
  await importFixture(page);
  await backToLibrary(page);
  await openResetDialog(page);
  await expect(resetDialog(page)).toContainText('It has no notes, highlights or bookmarks.');
  await page.keyboard.press('Escape');
  await expect(resetDialog(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
});

interface BookFileJson {
  device: { id: string };
  writtenAt: number;
  data: {
    notes: { id: string; text: string }[];
    tombstones: { id: string }[];
    progress?: { location: { page: number; offset: number } };
  };
}

const LAPTOP = { id: 'laptop-1', name: 'Edge on Windows' };

test('a reset reaches the folder and is not undone by another device that still has the old notes', async ({
  page,
}) => {
  await stubFolderPicker(page);
  await page.goto('/');
  await writeFolderFile(page, 'Physics/sample-textbook.pdf', await readFile(FIXTURE_PDF));
  await page.getByRole('button', { name: 'Link a folder…' }).click();
  await expect(card(page)).toBeVisible();
  // Open the book once its details (cover, page count) have been read from the PDF.
  await expect(card(page).locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await card(page)
    .getByRole('button', { name: /^Open / })
    .click();
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  const bookId = decodeURIComponent(new URL(page.url()).hash.split('/')[2]);

  await goToPage(page, 11);
  await addNote(page, 'Soon gone');
  await waitForProgressSave(page);

  const ownFile = async () => {
    const device = await ownDeviceId(page, [LAPTOP.id]);
    const text = await readFolderFile(page, `.scriptorium/devices/${device}/${bookId}.json`);
    return text ? (JSON.parse(text) as BookFileJson) : null;
  };
  const waitForOwnFile = async (ready: (file: BookFileJson) => boolean) => {
    let file: BookFileJson | null = null;
    await expect
      .poll(
        async () => {
          file = await ownFile();
          return file !== null && ready(file);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    return file as unknown as BookFileJson;
  };

  // Another device syncs this device's file, so it holds the same note and position.
  const before = await waitForOwnFile(
    (f) => f.data.notes.length === 1 && f.data.progress?.location.page === 11,
  );
  const laptopFile = (extraNotes: unknown[], writtenAt: number) =>
    JSON.stringify({
      ...before,
      device: LAPTOP,
      writtenAt,
      data: { ...before.data, notes: [...before.data.notes, ...extraNotes] },
    });
  const laptopPath = `.scriptorium/devices/${LAPTOP.id}/${bookId}.json`;
  await writeFolderFile(page, laptopPath, laptopFile([], before.writtenAt));

  await backToLibrary(page);
  await openResetDialog(page);
  await expect(resetDialog(page)).toContainText('deletes 1 note.');
  await expect(resetDialog(page)).toContainText('Other devices using this folder will see the reset too.');
  await resetDialog(page).getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(card(page)).toContainText('Not opened yet');

  const reset = await waitForOwnFile((f) => f.data.notes.length === 0 && f.data.tombstones.length === 1);
  expect(reset.data.tombstones[0].id).toBe(before.data.notes[0].id);
  expect(reset.data.progress?.location).toEqual({ page: 1, offset: 0 });

  // The other device writes again with its old copy plus a new note: the new note arrives, the old one stays deleted.
  const now = Date.now();
  await writeFolderFile(
    page,
    laptopPath,
    laptopFile(
      [
        {
          id: 'laptop-note',
          page: 1,
          y: 0.3,
          text: 'Only on the laptop',
          color: 'sage',
          createdAt: now,
          updatedAt: now,
        },
      ],
      now,
    ),
  );
  await expect(async () => {
    await focusApp(page);
    const merged = await ownFile();
    expect(merged?.data.notes.map((n) => n.text)).toEqual(['Only on the laptop']);
  }).toPass({ timeout: 20_000 });
  const merged = (await ownFile())!;
  expect(merged.data.tombstones.map((t) => t.id)).toEqual([before.data.notes[0].id]);
  expect(merged.data.progress?.location).toEqual({ page: 1, offset: 0 });

  await card(page)
    .getByRole('button', { name: /^Open / })
    .click();
  await expect(page.locator('#page-field')).toHaveValue('1');
  await expect(page.locator('.margin-note').filter({ hasText: 'Only on the laptop' })).toBeVisible();
  await expect(page.locator('.margin-note').filter({ hasText: 'Soon gone' })).toHaveCount(0);
});
