import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import {
  clearLibraryDatabase,
  focusApp,
  ownDeviceId,
  readFolderFile,
  removeFolderFile,
  storedPdfCount,
  stubFolderPicker,
  writeFolderFile,
} from './support/folder';
import { FIXTURE_PDF } from './support/paths';
import { addNote, backToLibrary, goToPage, TITLE, waitForProgressSave } from './support/reader';

const BOOK_PATH = 'Physics/sample-textbook.pdf';
const LAPTOP = { id: 'laptop-1', name: 'Edge on Windows' };

test.beforeEach(async ({ page }) => {
  await stubFolderPicker(page);
  await page.goto('/');
  await writeFolderFile(page, BOOK_PATH, await readFile(FIXTURE_PDF));
});

async function linkFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Link a folder…' }).click();
  await expect(bookCard(page)).toBeVisible();
}

const bookCard = (page: Page) => page.locator('.book-card').filter({ hasText: TITLE });

async function openBook(page: Page): Promise<string> {
  await bookCard(page)
    .getByRole('button', { name: /^Open / })
    .click();
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  return decodeURIComponent(new URL(page.url()).hash.split('/')[2]);
}

/** This device's file for the book, parsed, once it satisfies `ready`. */
async function waitForOwnFile(
  page: Page,
  bookId: string,
  ready: (file: BookFileJson) => boolean,
  otherDevices: string[] = [],
): Promise<BookFileJson> {
  const device = await ownDeviceId(page, otherDevices);
  let file: BookFileJson | null = null;
  await expect
    .poll(
      async () => {
        const text = await readFolderFile(page, `.scriptorium/devices/${device}/${bookId}.json`);
        file = text ? (JSON.parse(text) as BookFileJson) : null;
        return file !== null && ready(file);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return file!;
}

interface BookFileJson {
  format: string;
  device: { id: string; name: string };
  book: { id: string; title: string; pageCount: number };
  data: {
    notes: { text: string; page: number }[];
    progress?: { location: { page: number } };
  };
}

test('linking a folder adds its books, reads them in place and saves notes beside them', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();
  await linkFolder(page);
  await expect(bookCard(page).locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  expect(await readFolderFile(page, '.scriptorium/README.txt')).toContain('Scriptorium');

  const bookId = await openBook(page);
  expect(await storedPdfCount(page)).toBe(0);

  await goToPage(page, 3);
  await addNote(page, 'Saved beside the PDF');
  const file = await waitForOwnFile(page, bookId, (f) =>
    f.data.notes.some((n) => n.text === 'Saved beside the PDF'),
  );
  expect(file.format).toBe('scriptorium.book');
  expect(file.book).toMatchObject({ id: bookId, title: TITLE, pageCount: 36 });
});

test('notes and reading position from another device arrive while reading', async ({ page }) => {
  await linkFolder(page);
  const bookId = await openBook(page);
  const now = Date.now();
  await writeFolderFile(
    page,
    `.scriptorium/devices/${LAPTOP.id}/${bookId}.json`,
    JSON.stringify({
      format: 'scriptorium.book',
      version: 1,
      book: { id: bookId, title: TITLE, fileName: 'sample-textbook.pdf', pageCount: 36 },
      device: LAPTOP,
      writtenAt: now,
      data: {
        notes: [
          {
            id: 'note-from-laptop',
            page: 1,
            y: 0.3,
            text: 'Written on my laptop',
            color: 'sage',
            createdAt: now,
            updatedAt: now,
          },
        ],
        highlights: [],
        bookmarks: [],
        tombstones: [],
        progress: {
          location: { page: 20, offset: 0 },
          zoom: { mode: 'fit-width', scale: 1 },
          updatedAt: now + 60_000,
          deviceId: LAPTOP.id,
        },
      },
    }),
  );

  const note = page.locator('.margin-note').filter({ hasText: 'Written on my laptop' });
  await expect(async () => {
    await focusApp(page);
    await expect(note).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.locator('#page-field')).toHaveValue('1');

  const toast = page.locator('.toast').filter({ hasText: 'You were on p. 20 on Edge on Windows' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Go there' }).click();
  await expect(page.locator('#page-field')).toHaveValue('20');
  await expect(page.getByRole('button', { name: /Return to/ })).toBeVisible();

  const merged = await waitForOwnFile(
    page,
    bookId,
    (f) => f.data.notes.some((n) => n.text === 'Written on my laptop'),
    [LAPTOP.id],
  );
  expect(merged.device.id).not.toBe(LAPTOP.id);
});

test('after clearing browser data, linking the folder again restores books, notes and position', async ({
  page,
}) => {
  await linkFolder(page);
  const bookId = await openBook(page);
  await goToPage(page, 11);
  await addNote(page, 'Survives clearing site data');
  await waitForProgressSave(page);
  await waitForOwnFile(
    page,
    bookId,
    (f) =>
      f.data.progress?.location.page === 11 &&
      f.data.notes.some((n) => n.text === 'Survives clearing site data'),
  );

  await clearLibraryDatabase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();
  await linkFolder(page);
  await expect(page.locator('.toast').filter({ hasText: 'Found notes from 1 other device' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue reading' }).click();
  await expect(page.locator('#page-field')).toHaveValue('11');
  await expect(page.locator('.margin-note').filter({ hasText: 'Survives clearing site data' })).toBeVisible();
  await expect(
    page.locator('.toast').filter({ hasText: /Picked up where you left off on .+ · p\. 11/ }),
  ).toBeVisible();
});

test('a PDF removed from the folder shows as missing and keeps its notes', async ({ page }) => {
  await linkFolder(page);
  const bookId = await openBook(page);
  await addNote(page, 'Still here when the file returns');
  await waitForOwnFile(page, bookId, (f) => f.data.notes.length === 1);
  await backToLibrary(page);

  await removeFolderFile(page, BOOK_PATH);
  await expect(async () => {
    await focusApp(page);
    await expect(bookCard(page)).toContainText('File missing from folder', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  await writeFolderFile(page, 'Moved/sample-textbook.pdf', await readFile(FIXTURE_PDF));
  await expect(async () => {
    await focusApp(page);
    await expect(bookCard(page)).not.toContainText('File missing from folder', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  await openBook(page);
  await expect(
    page.locator('.margin-note').filter({ hasText: 'Still here when the file returns' }),
  ).toBeVisible();
});
