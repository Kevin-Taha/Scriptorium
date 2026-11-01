/**
 * Regenerates the README screenshots in docs/images. Builds the app, serves the build, fills a
 * fresh library with the sample books from sample-books.mjs, annotates "Orbits" the way a student
 * might, and captures each feature as WebP. Run with `bun run screenshots`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { generateSampleBooks } from './sample-books.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'images');
const PORT = 4390;
// Fixed, so "Opened 3 days ago" and similar labels come out the same on every run.
const NOW = new Date('2026-10-30T18:00:00');
const daysAgo = (days, hours = 0) => new Date(NOW.getTime() - (days * 24 + hours) * 3_600_000);

// ——— Reader helpers ———

async function importBook(page, file) {
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('toolbar', { name: 'Reader' }).waitFor();
  await page.locator('.page-sheet[data-page="1"] canvas').waitFor();
}

async function goToPage(page, number) {
  const field = page.locator('#page-field');
  await field.fill(String(number));
  await field.press('Enter');
  await page.locator(`.page-sheet[data-page="${number}"] canvas`).waitFor();
}

async function backToLibrary(page) {
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
}

/** Clears transient chrome (toasts, the return pill, focus rings, hover states) before a capture. */
async function tidy(page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
  while (await dismiss.count()) await dismiss.first().click();
  const pill = page.locator('.return-pill');
  if (await pill.count()) await pill.getByRole('button', { name: 'Dismiss' }).click();
  const viewport = page.locator('.reader__viewport');
  if (await viewport.count()) await viewport.focus();
  await page.mouse.move(2, 600);
}

/** The page a heading starts on, read from the reader's Contents sidebar. */
async function pageOf(page, heading) {
  const title = heading.replace(/^[\d.]+\s+/, '');
  const item = page.locator('.outline__item', { has: page.getByText(title, { exact: true }) }).first();
  return Number(await item.locator('.outline__page').textContent());
}

/**
 * Finds `phrase` in a page's text layer and returns its box, or null. Case, whitespace and hyphens
 * are ignored, so a phrase can run across a (hyphenated) line break. With `select`, it is also selected
 * the way a reader dragging across it would.
 */
function locate(page, number, phrase, select = false) {
  return page.evaluate(
    ([pageNumber, wanted, shouldSelect]) => {
      const layer = document.querySelector(`.page-sheet[data-page="${pageNumber}"] .textLayer`);
      if (!layer) return null;
      const skip = /[\s\-\u2010]/;
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      const positions = [];
      let text = '';
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (let offset = 0; offset < node.data.length; offset += 1) {
          if (skip.test(node.data[offset])) continue;
          positions.push([node, offset]);
          text += node.data[offset].toLowerCase();
        }
      }
      const compact = wanted.replace(/[\s\-\u2010]+/g, '').toLowerCase();
      const index = text.indexOf(compact);
      if (index < 0) return null;
      const [startNode, startOffset] = positions[index];
      const [endNode, endOffset] = positions[index + compact.length - 1];
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset + 1);
      if (shouldSelect) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      const { top, bottom } = range.getBoundingClientRect();
      return { top, bottom };
    },
    [number, phrase, select],
  );
}

/** Goes to the page holding `phrase`, searching forward from where `heading` starts. */
async function find(page, heading, phrase) {
  const first = await pageOf(page, heading);
  for (let number = first; number < first + 4; number += 1) {
    await goToPage(page, number);
    await page.locator(`.page-sheet[data-page="${number}"] .textLayer span`).first().waitFor();
    if (await locate(page, number, phrase)) return number;
  }
  throw new Error(`"${phrase}" is not within a few pages of "${heading}"`);
}

async function highlight(page, heading, phrase, colour, note) {
  const number = await find(page, heading, phrase);
  await locate(page, number, phrase, true);
  await page.getByRole('button', { name: `Highlight ${colour}` }).click();
  if (!note) return;
  const box = await page.locator(`.page-sheet[data-page="${number}"] .page-highlight`).last().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page
    .getByRole('toolbar', { name: 'Highlight actions' })
    .getByRole('button', { name: 'Add note' })
    .click();
  await writeNote(page, number, note);
}

/** Adds a margin note level with `phrase`. */
async function marginNote(page, heading, phrase, note) {
  const number = await find(page, heading, phrase);
  const { top, bottom } = await locate(page, number, phrase);
  const column = page.locator(`.margin-column[data-page="${number}"]`);
  const box = await column.boundingBox();
  await column.click({ position: { x: box.width / 2, y: (top + bottom) / 2 - box.y } });
  await writeNote(page, number, note);
}

/** Types a note, turning `**bold**` and `*italic*` into the editor's own formatting. */
async function writeNote(page, number, note) {
  const editor = page.getByRole('textbox', { name: `Note text, page ${number}` });
  await editor.waitFor();
  for (const part of note.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)) {
    if (!part) continue;
    const format = part.startsWith('**') ? 'Control+B' : part.startsWith('*') ? 'Control+I' : null;
    if (format) await page.keyboard.press(format);
    await page.keyboard.type(format ? part.replace(/\*/g, '') : part);
    if (format) await page.keyboard.press(format);
  }
  await editor.press('Escape');
}

async function bookmark(page, heading) {
  await goToPage(page, await pageOf(page, heading));
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('b');
}

async function setTheme(page, theme, { invert = false } = {}) {
  await page.getByRole('button', { name: 'Appearance' }).click();
  const menu = page.getByRole('dialog', { name: 'Appearance' });
  await menu.getByRole('radio', { name: theme }).click();
  if (theme === 'Dark') await menu.getByRole('switch', { name: /Invert page colours/ }).setChecked(invert);
  await page.keyboard.press('Escape');
}

// ——— Capture ———

async function capture(page, name) {
  await page.waitForTimeout(600);
  const png = await page.screenshot({ animations: 'disabled' });
  const encoder = await page.context().browser().newPage();
  const dataUrl = await encoder.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.9);
  }, png.toString('base64'));
  await encoder.close();
  const file = path.join(OUT, `${name}.webp`);
  await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(path.relative(ROOT, file));
}

// ——— The session ———

async function shelve(page, file, { openedAt, readTo }) {
  await page.clock.setFixedTime(openedAt);
  await importBook(page, file);
  await goToPage(page, readTo);
  await page.waitForTimeout(700);
  await backToLibrary(page);
}

async function annotateOrbits(page) {
  await marginNote(
    page,
    '1.1 The Wandering Stars',
    'Mars makes one roughly every twenty-six months',
    'Retrograde loop = Earth overtaking Mars on the inside',
  );
  await highlight(
    page,
    '2.1 The Ellipse',
    'semi-major axis',
    'Amber',
    '**a** sets the period *and* the energy (ch. 4)',
  );
  await highlight(page, '2.1 The Ellipse', 'the single most important number', 'Amber');
  await highlight(page, '2.1 The Ellipse', 'the ellipse becomes long and thin', 'Sky');
  await marginNote(
    page,
    '2.1 The Ellipse',
    'Mars, at e = 0.093',
    'Earth 0.017, Mars 0.093. Draw both to scale',
  );
  await highlight(
    page,
    '2.1 The Ellipse',
    'Each planet moves on an ellipse with the Sun at one focus.',
    'Sage',
  );
  await highlight(
    page,
    '2.2 Equal Areas in Equal Times',
    'sweeps out equal areas in equal times',
    'Rose',
    'Equal areas ⇔ angular momentum conserved (see 4.2)',
  );
  await marginNote(
    page,
    '2.3 The Harmonic Law',
    'The period of Mars',
    'Try Ceres: a = 2.77 AU gives T ≈ 4.6 yr',
  );
  await highlight(page, '4.1 Orbital Energy', 'the energy depends only on the size of the orbit', 'Lavender');
  await highlight(
    page,
    '5.2 The Hohmann Transfer',
    'the cheapest two-burn path',
    'Amber',
    '**Exam:** Earth → Mars Δv, both burns',
  );
  await bookmark(page, '2.1 The Ellipse');
  await bookmark(page, '5.2 The Hohmann Transfer');
}

async function main() {
  const [orbits, ...shelf] = await generateSampleBooks();
  await build({ root: ROOT, logLevel: 'warn' });
  const server = await preview({ root: ROOT, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
  const browser = await chromium.launch();
  try {
    await mkdir(OUT, { recursive: true });
    const context = await browser.newContext({
      baseURL: `http://localhost:${PORT}`,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.goto('/');

    const progress = [7, 3, 5, 2, 4];
    for (const [index, file] of shelf.entries()) {
      await shelve(page, file, { openedAt: daysAgo(12 - index * 2, index), readTo: progress[index] });
    }

    await page.clock.setFixedTime(daysAgo(0, 1));
    await importBook(page, orbits);
    await annotateOrbits(page);

    await goToPage(page, await pageOf(page, 'Kepler’s Laws'));
    await tidy(page);
    await capture(page, 'reader');
    await setTheme(page, 'Dark', { invert: true });
    await tidy(page);
    await capture(page, 'reader-dark');
    await setTheme(page, 'Light');

    await tidy(page);
    await page.keyboard.press('g');
    const goTo = page.getByRole('dialog', { name: 'Go to' });
    await goTo.getByRole('combobox').fill('ellipse');
    await goTo.getByRole('option').nth(4).waitFor();
    await capture(page, 'go-to');
    await page.keyboard.press('Escape');

    const figurePage = await find(page, '2.1 The Ellipse', 'Figure 2.1 An elliptical orbit');
    const linkPage = await find(page, '4.2 The Vis-Viva Equation', 'the geometry of Figure 2.1');
    await tidy(page);
    const link = page
      .locator(`.page-sheet[data-page="${linkPage}"]`)
      .getByRole('link', { name: `Go to page ${figurePage}` });
    await link.scrollIntoViewIfNeeded();
    await link.hover();
    await page
      .getByRole('dialog', { name: `Preview of page ${figurePage}` })
      .locator('canvas')
      .waitFor();
    await capture(page, 'link-peek');
    await page.mouse.move(2, 600);

    await page.keyboard.press('Shift+R');
    await page.locator('.review-row .page-thumb__image').first().waitFor();
    await tidy(page);
    await capture(page, 'review');
    await page.keyboard.press('Shift+R');

    const focusPage = await pageOf(page, '2.2 Equal Areas in Equal Times');
    await goToPage(page, focusPage);
    await setTheme(page, 'Sepia');
    await tidy(page);
    await page.keyboard.press('f');
    await page.locator('.focus-hint-region').getByText('F or Esc to leave').waitFor({ state: 'detached' });
    await page.keyboard.press('r');
    const line = await locate(page, focusPage, 'given area; near aphelion it moves slowly');
    await page.mouse.move(700, (line.top + line.bottom) / 2);
    await capture(page, 'focus');
    await page.keyboard.press('r');
    await page.keyboard.press('Escape');
    await setTheme(page, 'Light');

    await page.clock.setFixedTime(NOW);
    await backToLibrary(page);
    await tidy(page);
    // A little taller, so the shelf shows each book's progress.
    await page.setViewportSize({ width: 1440, height: 970 });
    await capture(page, 'library');
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
