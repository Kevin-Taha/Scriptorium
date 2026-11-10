import { expect, type Page, test } from '@playwright/test';
import { goToPage, importFixture } from './support/reader';

/** Selects `word` (by default, all of it) in the text-layer span on page 3 that contains `phrase`. */
async function select(page: Page, phrase: string, word?: string): Promise<void> {
  const span = page.locator('.page-sheet[data-page="3"] .textLayer span', { hasText: phrase }).first();
  await expect(span).toBeAttached();
  await span.evaluate((element, target) => {
    const node = [...element.childNodes].find((child) => child.textContent?.includes(target ?? ''))!;
    const start = target ? node.textContent!.indexOf(target) : 0;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, target ? start + target.length : node.textContent!.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  }, word);
}

const HEADING = '1.1 Position and Displacement';
const card = (page: Page, word: string) => page.getByRole('dialog', { name: `Definition of ${word}` });

test.beforeEach(async ({ page }) => {
  // Wiktionary, stood in for: the page's policy must still allow the request for it to arrive here.
  await page.route('https://en.wiktionary.org/api/rest_v1/page/definition/**', (route) => {
    const word = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!);
    if (word !== 'displacement') return route.fulfill({ status: 404, body: '' });
    return route.fulfill({
      json: {
        en: [
          {
            partOfSpeech: 'Noun',
            language: 'English',
            definitions: [{ definition: 'The act of <a href="/wiki/displace">displacing</a>.' }],
          },
        ],
      },
    });
  });
  await importFixture(page);
  await goToPage(page, 3);
});

test('Define looks up the selected word, from the toolbar or with D', async ({ page }) => {
  await select(page, HEADING, 'Displacement');
  const toolbar = page.getByRole('toolbar', { name: 'Selection actions' });
  await toolbar.getByRole('button', { name: 'Define' }).click();
  await expect(card(page, 'Displacement')).toContainText('The act of displacing.');
  await expect(card(page, 'Displacement').getByRole('link', { name: 'Wiktionary' })).toHaveAttribute(
    'href',
    'https://en.wiktionary.org/wiki/displacement#English',
  );
  await expect(toolbar).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card(page, 'Displacement')).toHaveCount(0);

  await select(page, HEADING, 'Position');
  await page.keyboard.press('d');
  await expect(card(page, 'Position')).toContainText('No dictionary entry found.');
});

test('Define is offered only for a word or short phrase', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Selection actions' });
  await select(page, 'useful quantity');
  await expect(toolbar.getByRole('button', { name: 'Add margin note' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Define' })).toHaveCount(0);
  await page.keyboard.press('d');
  await expect(page.getByRole('dialog', { name: /^Definition of/ })).toHaveCount(0);
});
