import { expect, test, type Page } from '@playwright/test';
import { goToPage, importFixture } from './support/reader';

const goTo = (page: Page) => page.getByRole('dialog', { name: 'Go to' });
const textMatches = (page: Page) =>
  goTo(page)
    .getByRole('group', { name: /^In the text/ })
    .getByRole('option');

/** Ctrl+F, then "motion", which occurs repeatedly in the generated textbook's body text. */
async function findMotion(page: Page): Promise<void> {
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('Control+f');
  const input = goTo(page).getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('motion');
  await expect(goTo(page).locator('.go-to__status')).toHaveText(/^[\d,]+ match/);
}

test.beforeEach(async ({ page }) => importFixture(page));

test('Ctrl+F finds text in Go to; matches stay highlighted, F3 steps, Return goes back, Esc clears', async ({
  page,
}) => {
  await findMotion(page);
  const first = textMatches(page).first();
  await expect(first.locator('mark')).toHaveText(/^motion$/i);
  await expect(first.locator('.go-to__detail')).toHaveText(/^p\. 3\b/);
  await first.click();
  await expect(goTo(page)).toBeHidden();
  await expect(page.locator('#page-field')).toHaveValue('3');
  await expect(page.locator('.page-sheet[data-page="3"] .search-highlight').first()).toBeVisible();
  const current = page.locator('.search-highlight.is-active');
  await expect(current).toHaveCount(1);
  const firstMatch = (await current.getAttribute('style'))!;
  await expect(page.locator('.return-pill')).toContainText('1');

  await page.keyboard.press('F3');
  await expect(current).not.toHaveAttribute('style', firstMatch);
  // Reopening keeps the query, with the current match selected.
  await page.keyboard.press('Control+f');
  const input = goTo(page).getByRole('combobox');
  await expect(input).toHaveValue('motion');
  await expect(textMatches(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape');
  await page.keyboard.press('Shift+F3');
  await expect(current).toHaveAttribute('style', firstMatch);

  await page.getByRole('button', { name: /Return to p\./ }).click();
  await expect(page.locator('#page-field')).toHaveValue('1');
  await page.keyboard.press('Escape');
  await expect(page.locator('.search-highlight')).toHaveCount(0);
});

test('stepping through matches adds no history', async ({ page }) => {
  await goToPage(page, 2);
  await findMotion(page);
  const pages = (await textMatches(page).locator('.go-to__detail').allInnerTexts()).map((detail) =>
    Number(/^p\. (\d+)/.exec(detail)![1]),
  );
  expect(pages[0]).toBe(3);
  const onPage3 = pages.filter((number) => number === 3).length;
  await textMatches(page).first().click();
  await expect(page.locator('#page-field')).toHaveValue('3');
  await expect(page.locator('.return-pill')).toContainText('2');
  for (let step = 0; step < onPage3; step++) await page.keyboard.press('F3');
  await expect(page.locator('#page-field')).toHaveValue(String(pages[onPage3]));
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('#page-field')).toHaveValue('2');
});
