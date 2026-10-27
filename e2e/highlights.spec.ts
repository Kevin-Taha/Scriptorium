import { expect, test, type Locator, type Page } from '@playwright/test';
import { goToPage, importFixture, waitForProgressSave } from './support/reader';

test.beforeEach(async ({ page }) => importFixture(page));

const PHRASE = '1.1 Position and Displacement';

/** Selects the contents of the text-layer span containing `phrase` and returns the selected text. */
async function selectPhrase(page: Page, pageNumber: number, phrase: string): Promise<string> {
  const span = page
    .locator(`.page-sheet[data-page="${pageNumber}"] .textLayer span`)
    .filter({ hasText: phrase })
    .first();
  await expect(span).toBeVisible();
  return span.evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
}

/** Clicks the middle of the first bar of a highlight, the way a reader would. */
async function clickHighlight(page: Page, highlight: Locator): Promise<void> {
  const box = (await highlight.first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('select text and highlight it; it persists, changes colour and links a note', async ({ page }) => {
  await goToPage(page, 3);
  await selectPhrase(page, 3, PHRASE);
  await page.getByRole('button', { name: 'Highlight Sage' }).click();

  const bars = page.locator('.page-highlight[data-note-color="sage"]');
  await expect(bars.first()).toBeVisible();
  await expect(page.locator('.selection-popover')).toHaveCount(0);
  await waitForProgressSave(page);
  await page.reload();
  await expect(bars.first()).toBeVisible();

  await clickHighlight(page, bars);
  const popover = page.getByRole('toolbar', { name: 'Highlight actions' });
  await expect(popover).toBeVisible();
  await popover.getByRole('button', { name: 'Rose', exact: true }).click();
  await expect(page.locator('.page-highlight[data-note-color="rose"]').first()).toBeVisible();

  await popover.getByRole('button', { name: 'Add note' }).click();
  const editor = page.getByRole('textbox', { name: 'Note text, page 3' });
  await expect(editor).toBeFocused();
  await expect(page.locator('.margin-note__quote.is-linked')).toHaveText(PHRASE);
  await editor.fill('Why displacement and not distance?');
  await editor.press('Escape');
  await waitForProgressSave(page);
  await page.reload();
  const linkedQuote = page.locator('.margin-note__quote.is-linked');
  await expect(linkedQuote).toHaveText(PHRASE);
  await expect(linkedQuote).toHaveAttribute('data-highlight-color', 'rose');

  // Clicking the highlight again opens the note it already has.
  await clickHighlight(page, page.locator('.page-highlight[data-note-color="rose"]'));
  await page
    .getByRole('toolbar', { name: 'Highlight actions' })
    .getByRole('button', { name: 'Open note' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Note text, page 3' })).toBeFocused();
  await expect(page.locator('.margin-note')).toHaveCount(1);
});

test('deleting a highlight keeps its note, and Undo brings the highlight and link back', async ({ page }) => {
  await goToPage(page, 3);
  await selectPhrase(page, 3, PHRASE);
  await page.getByRole('button', { name: 'Highlight Amber' }).click();
  await clickHighlight(page, page.locator('.page-highlight'));
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByRole('textbox', { name: 'Note text, page 3' }).fill('Keep me');
  await page.keyboard.press('Escape');
  await expect(page.locator('.margin-note__quote.is-linked')).toBeVisible();

  await clickHighlight(page, page.locator('.page-highlight'));
  await page.getByRole('button', { name: 'Delete highlight' }).click();
  await expect(page.locator('.page-highlight')).toHaveCount(0);
  await expect(page.locator('.margin-note').filter({ hasText: 'Keep me' })).toBeVisible();
  await expect(page.locator('.margin-note__quote.is-linked')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.page-highlight').first()).toBeVisible();
  await expect(page.locator('.margin-note__quote.is-linked')).toBeVisible();
});

test('H highlights the selection in the colour used last', async ({ page }) => {
  await goToPage(page, 3);
  await selectPhrase(page, 3, PHRASE);
  await page.getByRole('button', { name: 'Highlight Lavender' }).click();
  await expect(page.locator('.page-highlight[data-note-color="lavender"]').first()).toBeVisible();

  await selectPhrase(page, 3, 'The observed velocity');
  await page.keyboard.press('h');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Set(
            [...document.querySelectorAll('.page-highlight')].map((el) =>
              el.getAttribute('data-highlight-id'),
            ),
          ).size,
      ),
    )
    .toBe(2);
  await expect(page.locator('.page-highlight:not([data-note-color="lavender"])')).toHaveCount(0);
});

test('highlights stay on their text through zoom and selecting under them still works', async ({ page }) => {
  await goToPage(page, 3);
  await selectPhrase(page, 3, PHRASE);
  await page.getByRole('button', { name: 'Highlight Sky' }).click();

  const offsetFromText = async () =>
    page.evaluate((phrase) => {
      const bar = document.querySelector('.page-highlight')!.getBoundingClientRect();
      const span = [...document.querySelectorAll('.page-sheet[data-page="3"] .textLayer span')]
        .find((element) => element.textContent?.includes(phrase))!
        .getBoundingClientRect();
      return { dx: bar.left - span.left, dy: bar.top - span.top, width: bar.width / span.width };
    }, PHRASE);

  const before = await offsetFromText();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => Math.abs((await offsetFromText()).width - before.width)).toBeLessThan(0.05);
  const after = await offsetFromText();
  expect(Math.abs(after.dx)).toBeLessThan(2);
  expect(Math.abs(after.dy)).toBeLessThan(3);

  // Text under a highlight can still be selected (the bars take no pointer events).
  const selected = await selectPhrase(page, 3, PHRASE);
  expect(selected).toContain('Position');
  await expect(page.getByRole('toolbar', { name: 'Selection actions' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Highlight actions' })).toHaveCount(0);
});

test('the review lists pages that only have highlights, and the export includes them', async ({ page }) => {
  await goToPage(page, 11);
  await selectPhrase(page, 11, 'The ');
  await page.getByRole('button', { name: 'Highlight Sage' }).click();
  await goToPage(page, 3);
  await selectPhrase(page, 3, PHRASE);
  await page.getByRole('button', { name: 'Highlight Amber' }).click();
  await clickHighlight(page, page.locator('.page-highlight'));
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByRole('textbox', { name: 'Note text, page 3' }).fill('A linked thought');
  await page.keyboard.press('Escape');
  await waitForProgressSave(page);

  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('Shift+R');
  const rows = page.locator('.review-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Page 3');
  await expect(rows.nth(1)).toContainText('Page 11');
  await expect(rows.nth(1).locator('.review-highlight')).toHaveCount(1);
  await expect(rows.nth(0).locator('.review-note__quote.is-highlight')).toHaveText(PHRASE);
  await expect(page.locator('.review__count')).toHaveText('1 note and 2 highlights on 2 pages');

  await page.getByRole('searchbox', { name: 'Filter notes' }).fill('thought');
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear text filter' }).click();
  await page.getByRole('button', { name: /^Sage notes and highlights/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Page 11');
  await page.getByRole('button', { name: /^Sage notes and highlights/ }).click();
  await expect(rows).toHaveCount(2);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('1 note and 2 highlights on 2 pages');
  expect(markdown).toContain(`> ${PHRASE}\n\n_(highlight, amber)_\n\nA linked thought`);
  expect(markdown).toContain('_(highlight, sage)_');

  // The highlight on page 11 can be removed from the review, and Undo restores it.
  await rows.nth(1).hover();
  await page.getByRole('button', { name: 'Delete highlight' }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(2);
});

test('the sidebar Notes tab lists highlights and jumps to them', async ({ page }) => {
  await goToPage(page, 11);
  await selectPhrase(page, 11, 'The ');
  await page.getByRole('button', { name: 'Highlight Rose' }).click();
  await goToPage(page, 3);
  await page.getByRole('tab', { name: 'Notes' }).click();
  await expect(page.locator('.notes-panel__count')).toHaveText('1 highlight');
  await page.getByRole('button', { name: /Rose highlight/ }).click();
  await expect(page.locator('#page-field')).toHaveValue('11');
  await expect(page.locator('.page-highlight.is-pulsing').first()).toBeVisible();
});
