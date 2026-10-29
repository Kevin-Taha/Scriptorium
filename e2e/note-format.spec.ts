import { expect, type Page, test } from '@playwright/test';
import { goToPage, importFixture, waitForProgressSave } from './support/reader';

test.beforeEach(async ({ page }) => importFixture(page));

async function readDownload(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const chunks: Buffer[] = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('Ctrl+B and Ctrl+I format a note as it is written, in the margin and the review', async ({ page }) => {
  await goToPage(page, 3);
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('n');
  const editor = page.getByRole('textbox', { name: 'Note text, page 3' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute('aria-keyshortcuts', 'Control+B Meta+B Control+I Meta+I');

  // Italic for what is typed next, then bold on a selected word. Literal asterisks stay text.
  await page.keyboard.type('Momentum x*y*z is ');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.type('always');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.type(' conserved');
  await page.keyboard.press('ControlOrMeta+Shift+ArrowLeft');
  await page.keyboard.press('ControlOrMeta+b');
  await expect(editor.locator('i')).toHaveText('always');
  await expect(editor.locator('b')).toHaveText('conserved');
  await expect(editor).toHaveText('Momentum x*y*z is always conserved');
  await editor.press('Escape');

  const card = page.locator('.margin-note').filter({ hasText: 'Momentum x*y*z is always conserved' });
  const text = card.locator('.margin-note__text');
  await expect(text.locator('strong')).toHaveText('conserved');
  await expect(text.locator('em')).toHaveText('always');
  await waitForProgressSave(page);
  await page.reload();
  await expect(text.locator('strong')).toHaveText('conserved');
  await expect(text.locator('em')).toHaveText('always');
  await expect(text).toHaveText('Momentum x*y*z is always conserved');
  await page.getByRole('tab', { name: 'Notes' }).click();
  await expect(
    page.getByRole('button', { name: 'Amber note: Momentum x*y*z is always conserved' }),
  ).toBeVisible();

  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('Shift+R');
  const reviewText = page.locator('.review-note__text');
  await expect(reviewText.locator('strong')).toHaveText('conserved');
  await expect(reviewText.locator('em')).toHaveText('always');
  // The filter reads the words, not the markers, and marks matches inside the formatting.
  await page.getByRole('searchbox', { name: 'Filter notes' }).fill('always conserved');
  await expect(reviewText.locator('strong mark')).toHaveText('conserved');
  await expect(reviewText.locator('em mark')).toHaveText('always');

  const markdown = await readDownload(page);
  expect(markdown).toContain('Momentum x\\*y\\*z is *always* **conserved**');

  // The review edits the same way.
  await reviewText.click();
  const reviewEditor = page.getByRole('textbox', { name: 'Note text, page 3' });
  await expect(reviewEditor.locator('b')).toHaveText('conserved');
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+Shift+ArrowRight');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.press('Escape');
  await expect(reviewText.locator('em').first()).toHaveText('Momentum');
  await expect(reviewText).toHaveText('Momentum x*y*z is always conserved');
});

test('Enter adds a line break, pasted text arrives plain, and underline is not applied', async ({ page }) => {
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('n');
  const editor = page.getByRole('textbox', { name: /Note text, page/ });
  await expect(editor).toBeFocused();
  await page.keyboard.type('First line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second ');
  await editor.evaluate((element) => {
    const data = new DataTransfer();
    data.setData('text/html', '<b style="color: red">Rich</b><div>text</div>');
    data.setData('text/plain', 'Rich\ntext');
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('ControlOrMeta+u');
  await expect(editor.locator('b, u, div, [style]')).toHaveCount(0);
  await expect
    .poll(() => editor.evaluate((element) => (element as HTMLElement).innerText))
    .toBe('First line\nSecond Rich\ntext');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.locator('.margin-note__text').evaluate((element) => (element as HTMLElement).innerText))
    .toBe('First line\nSecond Rich\ntext');
});
