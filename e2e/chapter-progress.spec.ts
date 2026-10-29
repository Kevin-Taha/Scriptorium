import { expect, test } from '@playwright/test';
import { PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef } from 'pdf-lib';
import { LABELLED_FIXTURE_PDF } from './support/paths';
import { goToPage, importFixture } from './support/reader';

interface OutlineNode {
  title: string;
  /** Zero-based; a node without one has no destination. */
  page?: number;
  children?: OutlineNode[];
}

async function pdfWithOutline(nodes: OutlineNode[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const pages = Array.from({ length: 6 }, () => pdf.addPage());
  const { context } = pdf;
  const write = (siblings: OutlineNode[], parent: PDFRef): PDFRef[] => {
    const refs = siblings.map(() => context.nextRef());
    siblings.forEach((node, i) => {
      const dict = context.obj({ Title: PDFHexString.fromText(node.title), Parent: parent });
      if (node.page !== undefined) dict.set(PDFName.of('Dest'), context.obj([pages[node.page].ref, 'Fit']));
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < refs.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
      if (node.children) {
        const kids = write(node.children, refs[i]);
        dict.set(PDFName.of('First'), kids[0]);
        dict.set(PDFName.of('Last'), kids[kids.length - 1]);
        dict.set(PDFName.of('Count'), PDFNumber.of(kids.length));
      }
      context.assign(refs[i], dict);
    });
    return refs;
  };
  const root = context.nextRef();
  const top = write(nodes, root);
  const outlines = context.obj({
    Type: 'Outlines',
    First: top[0],
    Last: top[top.length - 1],
    Count: top.length,
  });
  context.assign(root, outlines);
  pdf.catalog.set(PDFName.of('Outlines'), root);
  return Buffer.from(await pdf.save());
}

test('chapter strip describes progress, jumps with history, and can be disabled', async ({ page }) => {
  await importFixture(page);
  const strip = page.getByRole('group', { name: 'Chapters' });
  const segments = strip.getByRole('button');
  await expect(segments).toHaveCount(6);
  await expect(segments.nth(0)).toHaveAccessibleName('Front matter · pp. 1–2 · 1 page left');
  await expect(segments.nth(1)).toHaveAccessibleName('Chapter 1: Kinematics · pp. 3–10 · not started');

  await goToPage(page, 14);
  const current = segments.nth(2);
  await current.hover();
  await expect(current).toHaveAttribute('aria-current', 'location');
  await expect(current).toHaveAccessibleName("Chapter 2: Newton's Laws · pp. 11–18 · 4 pages left");
  await expect(strip.locator('.chapter-progress__tooltip').nth(2)).toHaveCSS('opacity', '1');
  await expect(segments.nth(1)).toHaveAccessibleName('Chapter 1: Kinematics · pp. 3–10 · 100% read');
  await expect(segments.nth(3)).toHaveAccessibleName('Chapter 3: Energy and Work · pp. 19–26 · not started');

  await segments.nth(4).click();
  await expect(page.locator('#page-field')).toHaveValue('27');
  await expect(page.getByRole('button', { name: 'Return to p. 14' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to p. 14' }).click();
  await expect(page.locator('#page-field')).toHaveValue('14');

  await page.getByRole('button', { name: 'Appearance' }).click();
  const setting = page.getByRole('switch', { name: /Chapter progress/ });
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await expect(strip).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.page-sheet canvas').first()).toBeVisible();
  await expect(strip).toHaveCount(0);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('switch', { name: /Chapter progress/ }).check();
  await expect(segments).toHaveCount(6);
});

test('printed labels and keyboard focus are reflected in the strip', async ({ page }) => {
  await importFixture(page, LABELLED_FIXTURE_PDF);
  const strip = page.getByRole('group', { name: 'Chapters' });
  const segments = strip.getByRole('button');
  await expect(segments.nth(0)).toHaveAccessibleName('Front matter · pp. i–ii · 1 page left');
  await expect(segments.nth(2)).toHaveAccessibleName("Chapter 2: Newton's Laws · pp. 9–16 · not started");
  await segments.nth(2).focus();
  await expect(strip.locator('.chapter-progress__tooltip').nth(2)).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-field')).toHaveValue('9');
  await expect(page.getByRole('button', { name: 'Return to p. i' })).toBeVisible();
});

test('the strip is one tab stop; arrows move between segments, Enter and Space jump', async ({ page }) => {
  await importFixture(page);
  const strip = page.getByRole('group', { name: 'Chapters' });
  const segments = strip.getByRole('button');
  const tooltips = strip.locator('.chapter-progress__tooltip');
  await goToPage(page, 14);

  await expect(strip.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(strip.locator('button[tabindex="-1"]')).toHaveCount(5);
  await page.getByRole('button', { name: /^Review notes/ }).focus();
  await page.keyboard.press('Tab');
  await expect(segments.nth(2)).toBeFocused();
  await expect(tooltips.nth(2)).toHaveCSS('opacity', '1');

  await page.keyboard.press('ArrowRight');
  await expect(segments.nth(3)).toBeFocused();
  await expect(tooltips.nth(3)).toHaveCSS('opacity', '1');
  await expect(strip.locator('button[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('End');
  await expect(segments.nth(5)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(segments.nth(5)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(segments.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(segments.nth(1)).toBeFocused();
  await expect(page.locator('#page-field')).toHaveValue('14');

  await page.keyboard.press('Enter');
  await expect(page.locator('#page-field')).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Return to p. 14' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(page.locator('#page-field')).toHaveValue('11');

  await page.keyboard.press('Tab');
  await expect(strip.locator(':focus')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(segments.nth(2)).toBeFocused();
});

test('the strip’s click band stays on the toolbar, clear of the page', async ({ page }) => {
  await importFixture(page);
  const toolbar = await page.getByRole('toolbar', { name: 'Reader' }).boundingBox();
  expect(toolbar).not.toBeNull();
  const x = toolbar!.x + toolbar!.width * 0.4;
  const bottom = toolbar!.y + toolbar!.height;
  const inStrip = (y: number) =>
    page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('.chapter-progress'), [x, y]);
  expect(await inStrip(bottom - 4)).toBe(true);
  expect(await inStrip(bottom - 6)).toBe(true);
  expect(await inStrip(bottom + 3)).toBe(false);
  expect(await inStrip(bottom + 6)).toBe(false);
});

test('chapters come from the outline’s chapter level, through a title root and parts', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'wrapped-outline.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWithOutline([
      {
        title: 'The Book',
        page: 0,
        children: [
          {
            title: 'Part I',
            children: [
              { title: 'Chapter 1', page: 1 },
              { title: 'Chapter 2', page: 3 },
            ],
          },
          { title: 'Part II', children: [{ title: 'Chapter 3', page: 4 }] },
        ],
      },
    ]),
  });
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  const segments = page.getByRole('group', { name: 'Chapters' }).getByRole('button');
  await expect(segments).toHaveCount(4);
  await expect(segments.nth(0)).toHaveAccessibleName(/^Front matter · p\. 1 ·/);
  await expect(segments.nth(1)).toHaveAccessibleName('Chapter 1 · pp. 2–3 · not started');
  await expect(segments.nth(2)).toHaveAccessibleName('Chapter 2 · p. 4 · not started');
  await expect(segments.nth(3)).toHaveAccessibleName('Chapter 3 · pp. 5–6 · not started');
});

test('a book without an outline has one whole-book segment', async ({ page }) => {
  await page.goto('/');
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  await page.locator('input[type=file]').setInputFiles({
    name: 'no-outline.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
  const segments = page.getByRole('group', { name: 'Chapters' }).getByRole('button');
  await expect(segments).toHaveCount(1);
  await expect(segments.first()).toHaveAccessibleName('Book · pp. 1–2 · 1 page left');
});
