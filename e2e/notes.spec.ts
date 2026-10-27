import { expect, test } from '@playwright/test';
import { addNote, goToPage, importFixture, waitForProgressSave } from './support/reader';

test.beforeEach(async ({ page }) => importFixture(page));

test('margin click creates an editable note, persists, changes colour and supports undo', async ({
  page,
}) => {
  await goToPage(page, 3);
  await page.locator('.margin-column[data-page="3"]').click({ position: { x: 30, y: 180 } });
  const editor = page.getByRole('textbox', { name: 'Note text, page 3' });
  await expect(editor).toBeFocused();
  await editor.fill('A note beside the text');
  await page.locator('.reader__viewport').focus();
  const note = page.locator('.margin-note').filter({ hasText: 'A note beside the text' });
  await expect(note).toBeVisible();
  await waitForProgressSave(page);
  await page.reload();
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: /Change colour/ }).click();
  await note.getByRole('button', { name: 'Sage', exact: true }).click();
  await expect(note).toHaveAttribute('data-note-color', 'sage');
  await note.getByRole('button', { name: 'Delete note' }).click();
  await expect(note).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute('data-note-color', 'sage');
});

test('an empty new note is discarded on blur', async ({ page }) => {
  await page.locator('.margin-column[data-page="1"]').click({ position: { x: 30, y: 180 } });
  await expect(page.getByRole('textbox', { name: 'Note text, page 1' })).toBeFocused();
  await page.locator('.reader__viewport').focus();
  await expect(page.locator('.margin-note')).toHaveCount(0);
});

test('selected PDF text creates a note retaining the quote', async ({ page }) => {
  await goToPage(page, 3);
  const text = page.locator('.page-sheet[data-page="3"] .textLayer span').filter({
    hasText: '1.1 Position and Displacement',
  });
  await expect(text).toBeVisible();
  const quote = await text.evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  await page.getByRole('button', { name: /Add margin note/ }).click();
  await expect(page.locator('.margin-note__quote')).toHaveText(quote);
  await expect(page.getByRole('textbox', { name: 'Note text, page 3' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Note text, page 3' }).fill('Quoted passage');
  await page.keyboard.press('Escape');
  await waitForProgressSave(page);
  await page.reload();
  await expect(page.locator('.margin-note__quote')).toHaveText(quote);
});

test('N creates notes at nearby anchors without overlapping', async ({ page }) => {
  await goToPage(page, 3);
  await addNote(page, 'First nearby note');
  await addNote(page, 'Second nearby note');
  await addNote(page, 'Third nearby note');
  const notes = page.locator('.page-margin[data-page="3"] .margin-note');
  await expect(notes).toHaveCount(3);
  await expect
    .poll(async () => {
      const boxes = await notes.evaluateAll((elements) =>
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom };
          })
          .sort((a, b) => a.top - b.top),
      );
      return boxes.slice(1).every((box, index) => box.top >= boxes[index].bottom - 1);
    })
    .toBe(true);
});

test('reader shortcuts do not fire while typing in note or page field', async ({ page }) => {
  await page.keyboard.press('n');
  const editor = page.getByRole('textbox', { name: /Note text, page/ });
  await expect(editor).toBeFocused();
  await editor.pressSequentially('bng[0');
  await expect(editor).toHaveValue('bng[0');
  await expect(page.getByRole('button', { name: 'Bookmark page (B)' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('.margin-note')).toHaveCount(1);
  await expect(page.locator('.reader')).toHaveAttribute('data-sidebar-open', 'true');
  await editor.press('Escape');
  await page.locator('#page-field').fill('');
  await page.locator('#page-field').pressSequentially('bng');
  await expect(page.locator('#page-field')).toHaveValue('bng');
  await expect(page.locator('.margin-note')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Bookmark page (B)' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('note remains on its page and anchor after zoom and virtualization', async ({ page }) => {
  await goToPage(page, 6);
  await addNote(page, 'Anchor survives zoom');
  const note = page
    .locator('.page-margin[data-page="6"] .margin-note')
    .filter({ hasText: 'Anchor survives zoom' });
  const anchor = page.locator('.page-margin[data-page="6"] .margin-note__anchor');
  const normalizedAnchor = async () =>
    anchor.evaluate((element) => {
      const column = element.closest('.margin-column')!;
      return (
        (element.getBoundingClientRect().top - column.getBoundingClientRect().top) /
        column.getBoundingClientRect().height
      );
    });
  const before = await normalizedAnchor();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(note).toBeVisible();
  await expect.poll(async () => Math.abs((await normalizedAnchor()) - before)).toBeLessThan(0.01);
  await goToPage(page, 30);
  await expect(note).toHaveCount(0);
  await goToPage(page, 6);
  await expect(note).toBeVisible();
  await expect.poll(async () => Math.abs((await normalizedAnchor()) - before)).toBeLessThan(0.01);
});
