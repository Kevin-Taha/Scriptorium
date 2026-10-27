import { expect, test } from '@playwright/test';
import { addNote, goToPage, importFixture, TITLE, waitForProgressSave } from './support/reader';

test.beforeEach(async ({ page }) => importFixture(page));

test('empty review opens and closes with Shift+R', async ({ page }) => {
  await page.keyboard.press('Shift+R');
  await expect(page.getByRole('heading', { name: 'Nothing to review yet' })).toBeVisible();
  await page.keyboard.press('Shift+R');
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
});

test('review orders pages, filters, edits, exports, persists density and jumps back', async ({ page }) => {
  await goToPage(page, 11);
  await addNote(page, 'Second chapter observation');
  await goToPage(page, 3);
  await addNote(page, 'First chapter insight');
  await goToPage(page, 15);
  await waitForProgressSave(page);
  await page.keyboard.press('Shift+R');
  const rows = page.locator('.review-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Page 3');
  await expect(rows.nth(1)).toContainText('Page 11');
  await expect(rows.nth(0).locator('.page-thumb__image')).toBeVisible();
  await expect(rows.nth(0).locator('.review-row__dot')).toHaveCount(1);

  await page.getByRole('radio', { name: 'Dense' }).click();
  await expect(page.locator('.review')).toHaveClass(/review--dense/);
  await expect(page.locator('.page-thumb')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Dense' })).toHaveAttribute('aria-checked', 'true');
  await expect(rows).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Filter notes' }).fill('insight');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Page 3');
  await page.getByRole('button', { name: 'Clear text filter' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByText('First chapter insight', { exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Note text, page 3' });
  await editor.fill('Edited review insight');
  await editor.press('Escape');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain(TITLE);
  expect(markdown).toContain('Page 3');
  expect(markdown).toContain('Edited review insight');
  expect(markdown).toContain('Second chapter observation');

  await page.getByRole('button', { name: 'Go to page 3' }).click();
  await expect(page.locator('#page-field')).toHaveValue('3');
  await expect(page.locator('.return-pill')).toContainText('15');
  await expect(page.locator('.margin-note').filter({ hasText: 'Edited review insight' })).toBeVisible();
  await waitForProgressSave(page);
  await page.reload();
  await expect(page.locator('.margin-note').filter({ hasText: 'Edited review insight' })).toBeVisible();
});

test('Markdown export includes selected quotations', async ({ page }) => {
  await goToPage(page, 3);
  const text = page
    .locator('.page-sheet[data-page="3"] .textLayer span')
    .filter({ hasText: '1.1 Position and Displacement' });
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
  await page.getByRole('textbox', { name: 'Note text, page 3' }).fill('A quoted idea');
  await page.keyboard.press('Escape');
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('Shift+R');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain(quote);
  expect(markdown).toContain('A quoted idea');
});
