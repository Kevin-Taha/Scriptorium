import { expect, test, type Page } from '@playwright/test';
import { goToPage, importFixture } from './support/reader';

async function searchMotion(page: Page): Promise<void> {
  await page.keyboard.press('Control+f');
  await expect(page.getByRole('tab', { name: 'Search (Ctrl+F)' })).toHaveAttribute('aria-selected', 'true');
  const search = page.locator('#search-input');
  await expect(search).toBeFocused();
  // "motion" occurs repeatedly in the generated textbook's body text.
  await search.fill('motion');
  await expect(page.locator('.search [role=status]')).toHaveText(/\d+ results? on \d+ pages?/);
  await expect.poll(() => page.locator('.search-group').count()).toBeGreaterThan(1);
}

test.beforeEach(async ({ page }) => importFixture(page));

test('Ctrl+F opens search; results, highlights, stepping, Return and Escape work', async ({ page }) => {
  await page.keyboard.press('[');
  await expect(page.locator('.reader')).toHaveAttribute('data-sidebar-open', 'false');
  await searchMotion(page);
  await expect(page.locator('.search-group__page').first()).toHaveText('Page 3');
  await expect(page.locator('.search-result mark').first()).toHaveText(/motion/i);
  const search = page.locator('#search-input');
  await search.press('Enter');
  await expect(page.locator('#page-field')).toHaveValue('3');
  await expect(page.locator('.page-sheet[data-page="3"] .search-highlight').first()).toBeVisible();
  await expect(page.locator('.page-sheet[data-page="3"] .search-highlight.is-active')).toHaveCount(1);
  await expect(page.locator('.search [role=status]')).toHaveText(/^1 of \d+ results? on \d+ pages?/);
  await expect(page.locator('.return-pill')).toContainText('1');
  await search.press('Enter');
  await expect(page.locator('.search [role=status]')).toHaveText(/^2 of \d+ results? on \d+ pages?/);
  await search.press('Shift+Enter');
  await expect(page.locator('.search [role=status]')).toHaveText(/^1 of \d+ results? on \d+ pages?/);
  await page.getByRole('button', { name: /Return to p\./ }).click();
  await expect(page.locator('#page-field')).toHaveValue('1');
  await search.focus();
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await expect(page.locator('.search-highlight')).toHaveCount(0);
});

test('search stepping does not add history entries', async ({ page }) => {
  await goToPage(page, 2);
  await searchMotion(page);
  const search = page.locator('#search-input');
  const groups = page.locator('.search-group');
  await expect(groups.first().locator('.search-group__page')).toHaveText('Page 3');
  const firstPageHits = await groups.first().locator('.search-result').count();
  expect(firstPageHits).toBeGreaterThan(0);
  const nextPageText = await groups.nth(1).locator('.search-group__page').innerText();
  const nextPage = Number(nextPageText.replace(/\D/g, ''));
  expect(nextPage).toBeGreaterThan(3);
  await search.press('Enter');
  await expect(page.locator('#page-field')).toHaveValue('3');
  await expect(page.locator('.return-pill')).toContainText('2');
  for (let position = 2; position <= firstPageHits + 1; position++) {
    await search.press('Enter');
    await expect(page.locator('.search [role=status]')).toHaveText(
      new RegExp(`^${position} of \\d+ results? on \\d+ pages?`),
    );
  }
  await expect(page.locator('#page-field')).toHaveValue(String(nextPage));
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('#page-field')).toHaveValue('2');
});
