import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { goToPage, importFixture } from './support/reader';

test.beforeEach(async ({ page }) => importFixture(page));

test('outline, Return, and back/forward history', async ({ page }) => {
  const field = page.locator('#page-field');
  await expect(page.getByRole('button', { name: 'Back (Alt+Left)' })).toBeDisabled();
  await page.locator('.outline__title', { hasText: "Chapter 2: Newton's Laws" }).click();
  await expect(field).toHaveValue('11');
  await expect(page.locator('.return-pill')).toContainText('1');
  await expect(page.getByRole('treeitem', { name: /Chapter 2: Newton's Laws/ }).first()).toHaveAttribute(
    'aria-current',
    'location',
  );
  await page.locator('.reader__viewport').evaluate((viewport) => {
    viewport.scrollTop += 70;
  });
  await expect(page.getByRole('treeitem', { name: /2.1 Inertia and Force/ })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await page.getByRole('button', { name: /Return to p\./ }).click();
  await expect(field).toHaveValue('1');
  await page.keyboard.press('Alt+ArrowRight');
  await expect(field).toHaveValue('11');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(field).toHaveValue('1');
  await goToPage(page, 19);
  await expect(page.getByRole('button', { name: 'Forward (Alt+Right)' })).toBeDisabled();
});

test('Return steps back through a chain of jumps, or skips straight to an earlier one', async ({ page }) => {
  const field = page.locator('#page-field');
  await goToPage(page, 6);
  await goToPage(page, 11);
  await goToPage(page, 15);
  await page.getByRole('button', { name: 'Return to p. 11' }).click();
  await expect(field).toHaveValue('11');
  await page.getByRole('button', { name: 'Return to p. 6' }).click();
  await expect(field).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Return to p. 1' })).toBeVisible();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(field).toHaveValue('11');
  await page.keyboard.press('Alt+ArrowRight');
  await expect(field).toHaveValue('15');
  await page.getByRole('button', { name: '2 earlier places' }).click();
  await page
    .getByRole('group', { name: 'Earlier places' })
    .getByRole('button', { name: 'p. 1', exact: true })
    .click();
  await expect(field).toHaveValue('1');
  await expect(page.locator('.return-pill')).toHaveCount(0);
  await expect(page.locator('.reader__viewport')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Forward to page 6 (Alt+Right)' })).toBeEnabled();
});

test('returning to another position on the same offered page keeps the next Return available', async ({
  page,
}) => {
  await page.locator('.reader__viewport').evaluate((viewport) => {
    viewport.scrollTop += 400;
  });
  await expect
    .poll(() =>
      page.locator('.page-sheet[data-page="1"]').evaluate((sheet) => {
        const viewport = sheet.closest('.reader__viewport')!;
        return viewport.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
      }),
    )
    .toBeGreaterThan(300);
  await goToPage(page, 1);
  await page.locator('.page-sheet[data-page="1"]').evaluate((sheet) => {
    const viewport = sheet.closest('.reader__viewport')!;
    viewport.scrollTop +=
      sheet.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top +
      sheet.getBoundingClientRect().height * 0.6;
  });
  await expect
    .poll(() =>
      page.locator('.page-sheet[data-page="1"]').evaluate((sheet) => {
        const viewport = sheet.closest('.reader__viewport')!;
        return (
          (viewport.getBoundingClientRect().top - sheet.getBoundingClientRect().top) /
          sheet.getBoundingClientRect().height
        );
      }),
    )
    .toBeGreaterThan(0.5);
  await goToPage(page, 2);
  await page.getByRole('button', { name: 'Return to p. 1' }).click();
  await expect(page.locator('#page-field')).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Return to p. 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to p. 1' }).click();
  await expect(page.locator('.return-pill')).toHaveCount(0);
});

test('bookmark toggle, label, rename persistence, jump and delete', async ({ page }) => {
  await goToPage(page, 6);
  await page.keyboard.press('b');
  await expect(page.locator('.page-sheet[data-page="6"] .page-sheet__ribbon')).toBeVisible();
  await page.getByRole('tab', { name: 'Bookmarks' }).click();
  await expect(page.locator('.bookmark-list__item')).toContainText('1.2 Velocity');
  await page.getByRole('button', { name: 'Rename bookmark on page 6' }).click();
  await page.getByRole('textbox', { name: 'Rename bookmark on page 6' }).fill('Velocity reminder');
  await page.getByRole('textbox', { name: 'Rename bookmark on page 6' }).press('Enter');
  await expect(page.locator('.bookmark-list__item')).toContainText('Velocity reminder');
  await page.reload();
  await expect(page.locator('.page-sheet canvas').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Bookmarks' }).click();
  await expect(page.locator('.bookmark-list__item')).toContainText('Velocity reminder');
  await goToPage(page, 11);
  await page.getByRole('button', { name: /Velocity reminder/ }).click();
  await expect(page.locator('#page-field')).toHaveValue('6');
  await page.getByRole('button', { name: 'Delete bookmark on page 6' }).click();
  await expect(page.locator('.bookmark-list__item')).toHaveCount(0);
  await expect(page.locator('.page-sheet[data-page="6"] .page-sheet__ribbon')).toHaveCount(0);
});

test('ordinary scrolling is not history; Back restores intra-page position', async ({ page }) => {
  await page.locator('.reader__viewport').evaluate((viewport) => {
    viewport.scrollTop += 200;
  });
  await expect(page.getByRole('button', { name: 'Back (Alt+Left)' })).toBeDisabled();
  const pageOne = page.locator('.page-sheet[data-page="1"]');
  const offset = async () =>
    pageOne.evaluate((element) => {
      const viewport = element.closest('.reader__viewport')!;
      return (
        (viewport.getBoundingClientRect().top - element.getBoundingClientRect().top) /
        element.getBoundingClientRect().height
      );
    });
  await expect.poll(offset).toBeGreaterThan(0.1);
  const before = await offset();
  await goToPage(page, 11);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('#page-field')).toHaveValue('1');
  await expect.poll(async () => Math.abs((await offset()) - before)).toBeLessThan(0.03);
});

test('sidebar, bookmark and dismiss shortcuts toggle their controls', async ({ page }) => {
  const reader = page.locator('.reader');
  await page.keyboard.press('[');
  await expect(reader).toHaveAttribute('data-sidebar-open', 'false');
  await page.keyboard.press('[');
  await expect(reader).toHaveAttribute('data-sidebar-open', 'true');
  await page.keyboard.press('b');
  await expect(page.locator('.page-sheet[data-page="1"] .page-sheet__ribbon')).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.locator('.page-sheet[data-page="1"] .page-sheet__ribbon')).toHaveCount(0);
  await goToPage(page, 3);
  await expect(page.locator('.return-pill')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.return-pill')).toHaveCount(0);
});

test('a PDF without an outline shows its empty state and page-number bookmark', async ({ page }) => {
  // This case needs a PDF without an outline rather than the shared textbook fixture.
  await page.getByRole('button', { name: 'Back to library' }).click();
  const document = await PDFDocument.create();
  document.addPage();
  const bytes = await document.save();
  await page.locator('input[type=file]').setInputFiles({
    name: 'no-outline.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No contents in this PDF' })).toBeVisible();
  await page.keyboard.press('b');
  await page.getByRole('tab', { name: 'Bookmarks' }).click();
  await expect(page.locator('.bookmark-list__item')).toContainText('Page 1');
});
