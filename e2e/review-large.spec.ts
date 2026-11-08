import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { FIXTURE_PDF } from './support/paths';

test('large review loads pages on demand while navigation, filters and full-list mode work', async ({
  page,
}) => {
  const source = await PDFDocument.load(await readFile(FIXTURE_PDF));
  const large = await PDFDocument.create();
  for (let copy = 0; copy < 2; copy++) {
    const pages = await large.copyPages(
      source,
      Array.from({ length: 30 }, (_, index) => index),
    );
    for (const pdfPage of pages) large.addPage(pdfPage);
  }
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'large-review.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await large.save()),
  });
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
  await page.evaluate(async () => {
    const docId = decodeURIComponent(location.hash.split('/')[2]);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scriptorium');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['notes', 'highlights'], 'readwrite');
    for (let pageNumber = 1; pageNumber <= 60; pageNumber++) {
      for (let n = 0; n < 2; n++) {
        tx.objectStore('notes').put({
          id: `large-${pageNumber}-${n}`,
          docId,
          page: pageNumber,
          y: (n + 1) / 3,
          text: `Observation ${pageNumber} item ${n}${pageNumber % 10 === 0 && n === 0 ? `\n${'Long note. '.repeat(100)}` : ''}`,
          color: 'amber',
          createdAt: pageNumber * 2 + n,
          updatedAt: pageNumber * 2 + n,
        });
      }
    }
    tx.objectStore('highlights').put({
      id: 'large-highlight',
      docId,
      page: 60,
      rects: [{ x: 0.1, y: 0.9, w: 0.3, h: 0.02 }],
      text: 'A highlighted passage',
      color: 'sky',
      createdAt: 999,
      updatedAt: 999,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Review notes (121)' })).toBeVisible();
  await page.getByRole('button', { name: 'Review notes (121)' }).click();
  const slots = page.locator('.review-page-slot');
  await expect(slots).toHaveCount(60);
  await expect(page.locator('.review-row').first()).toBeVisible();
  await expect.poll(() => page.locator('.review-row').count()).toBeLessThan(20);

  // The keyboard can reach the last item even though its page is not mounted yet.
  await expect(slots.last().locator('.review-row')).toHaveCount(0);
  await page.locator('.review__scroll').focus();
  await page.keyboard.press('k');
  await expect(page.locator('[data-highlight-id="large-highlight"]')).toBeFocused();
  await page
    .locator('[data-highlight-id="large-highlight"]')
    .getByRole('button', { name: 'Delete highlight' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-note-id="large-60-1"]')).toBeFocused();
  await page.keyboard.press('k');
  await expect(page.locator('[data-note-id="large-60-0"]')).toBeFocused();
  await page.keyboard.press('k');
  await expect(page.locator('[data-note-id="large-59-1"]')).toBeFocused();

  // An editor remains mounted and focused when its page scrolls out of the viewport.
  await page.locator('[data-note-id="large-59-1"]').click();
  const editor = page.getByRole('textbox', { name: 'Note text, page 59' });
  await editor.fill('Edited while scrolling');
  await page.locator('.review__scroll').evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Edited while scrolling');
  await editor.press('Escape');

  await page.locator('.review__scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(slots.last().locator('.page-thumb__image')).toBeVisible();
  await expect.poll(() => page.locator('.review-row').count()).toBeLessThan(20);

  // Tabbing to an unloaded page continues at the correct end of its controls.
  await expect(slots.nth(29).locator('.review-row')).toHaveCount(0);
  await slots.nth(29).evaluate((element: HTMLElement) => element.focus({ preventScroll: true }));
  await expect(page.locator('[data-note-id="large-30-1"] button')).toBeFocused();
  await expect(slots.nth(44).locator('.review-row')).toHaveCount(0);
  await slots.nth(44).evaluate((element: HTMLElement) => element.focus({ preventScroll: true }));
  await expect(page.getByRole('button', { name: 'Go to page 45' })).toBeFocused();

  await page.getByRole('searchbox', { name: 'Filter notes' }).fill('Observation 40 item 1');
  await expect(slots).toHaveCount(1);
  await expect(page.locator('.review-note')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('Observation 1 item 0');
  expect(markdown).toContain('Observation 60 item 1');
  expect(markdown).toContain('Edited while scrolling');
  await page.getByRole('button', { name: 'Clear text filter' }).click();
  await expect(slots).toHaveCount(60);
  await page.getByRole('button', { name: 'Show all pages' }).click();
  await expect(page.locator('.review-row')).toHaveCount(60);
  await page.getByRole('button', { name: 'Load pages as needed' }).click();
  await expect.poll(() => page.locator('.review-row').count()).toBeLessThan(20);
  await page.reload();
  await page.getByRole('searchbox', { name: 'Filter notes' }).fill('Edited while scrolling');
  await expect(page.locator('.review-note')).toContainText('Edited while scrolling');
});
