import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { FakeDrive } from '../src/features/sync/drive/testing/fakeDrive';
import { signInCount, stubGoogle, watchCspViolations } from './support/drive';
import { FIXTURE_PDF } from './support/paths';
import { addNote, backToLibrary, goToPage, TITLE } from './support/reader';

let drive: FakeDrive;
let violations: string[];

test.beforeEach(async ({ page }) => {
  drive = new FakeDrive();
  drive.write('Textbooks/Physics/sample-textbook.pdf', await readFile(FIXTURE_PDF));
  drive.mkdirs('Photos');
  violations = await watchCspViolations(page);
  await stubGoogle(page, drive);
});

test.afterEach(() => {
  expect(violations).toEqual([]);
});

const bookCard = (page: Page) => page.locator('.book-card').filter({ hasText: TITLE });

async function linkDriveFolder(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Library and storage' }).click();
  const storage = page.getByRole('dialog', { name: 'Library & storage' });
  await storage.getByText('Sync a Google Drive folder directly').click();
  await expect(storage.getByText(/Requires approval\./)).toBeVisible();
  await storage.getByRole('button', { name: 'Choose a Drive folder…' }).click();

  const chooser = page.getByRole('dialog', { name: 'Choose a Google Drive folder' });
  await expect(chooser.getByText('Signed in as reader@example.com.', { exact: false })).toBeVisible();
  await chooser.getByRole('button', { name: 'Textbooks' }).click();
  await expect(chooser.getByRole('button', { name: 'Physics' })).toBeVisible();
  await chooser.getByRole('button', { name: 'Use “Textbooks”' }).click();
  await expect(chooser).toBeHidden();
  await expect(storage.getByText(/In Google Drive · Last synced/)).toBeVisible({ timeout: 15_000 });
  await storage.getByRole('button', { name: 'Close library and storage' }).click();
  await expect(bookCard(page)).toBeVisible();
}

async function openBook(page: Page): Promise<string> {
  await bookCard(page)
    .getByRole('button', { name: /^Open / })
    .click();
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  return decodeURIComponent(new URL(page.url()).hash.split('/')[2]);
}

/** This device's notes file for the book in Drive, parsed, once one exists. */
async function ownDriveFile(bookId: string): Promise<{ data: { notes: { text: string }[] } }> {
  let text: string | null = null;
  await expect
    .poll(
      () => {
        const devices = drive.names('Textbooks/.scriptorium/devices');
        text = devices.length
          ? drive.readText(`Textbooks/.scriptorium/devices/${devices[0]}/${bookId}.json`)
          : null;
        return text;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return JSON.parse(text!);
}

test('a Google Drive folder links from Library & storage, and notes are saved beside its PDFs', async ({
  page,
}) => {
  await linkDriveFolder(page);
  expect(drive.readText('Textbooks/.scriptorium/README.txt')).toContain('Scriptorium');
  await expect(bookCard(page).locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);

  const bookId = await openBook(page);
  await goToPage(page, 3);
  await addNote(page, 'Saved in my Drive');
  await expect
    .poll(async () => (await ownDriveFile(bookId)).data.notes.map((note) => note.text), { timeout: 15_000 })
    .toEqual(['Saved in my Drive']);
  expect(drive.names('Textbooks/Physics')).toEqual(['sample-textbook.pdf']);
});

test('after a restart, books reopen from the browser and one click reconnects to Drive', async ({ page }) => {
  await linkDriveFolder(page);
  await openBook(page);
  await backToLibrary(page);

  await page.reload();
  const reconnect = page.getByRole('button', { name: 'Reconnect “Textbooks”' });
  await expect(reconnect).toBeVisible();
  const downloads = drive.log.filter((entry) => entry.startsWith('GET /drive/v3/files/item-')).length;
  await openBook(page);
  expect(drive.log.filter((entry) => entry.startsWith('GET /drive/v3/files/item-')).length).toBe(downloads);
  expect(await signInCount(page)).toBe(0);

  await backToLibrary(page);
  await page.getByRole('button', { name: 'Reconnect “Textbooks”' }).click();
  await expect(page.locator('.folder-chip')).toContainText('synced', { timeout: 15_000 });
  expect(await signInCount(page)).toBe(1);
});
