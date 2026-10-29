import { expect, type Page, test } from '@playwright/test';
import { addNote, goToPage, importFixture } from './support/reader';

const PAGES = 36;

test.beforeEach(async ({ page }) => importFixture(page));

/** A point on the fore-edge strip at `along` pages into the book (e.g. 19.5 = the middle of page 20). */
async function mapPoint(page: Page, along: number): Promise<{ x: number; y: number }> {
  const track = (await page.locator('.book-map__track').boundingBox())!;
  return { x: track.x + track.width - 12, y: track.y + (along / PAGES) * track.height };
}

const pageField = (page: Page) => page.locator('#page-field');
const currentPage = async (page: Page) => Number(await pageField(page).inputValue());

test('hovering the map previews the page under the pointer', async ({ page }) => {
  await expect(page.getByRole('slider', { name: 'Book map' })).toBeVisible();
  const point = await mapPoint(page, 21.5);
  await page.mouse.move(point.x, point.y);
  const card = page.locator('.book-map-card');
  await expect(card).toContainText('p. 22');
  await expect(card).toContainText('of 36');
  await expect(card).toContainText('3.2 Kinetic and Potential Energy');
  await expect(card.locator('img')).toBeVisible();
  await expect(page.locator('.book-map__tab')).toHaveText(['1', '2', '3', '4', 'A']);

  await page.mouse.move(600, 400);
  await expect(card).toHaveCount(0);
});

test('a click jumps to the page, keeps focus on the pages and leaves a way back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const point = await mapPoint(page, 19.5);
  await page.mouse.click(point.x, point.y);
  await expect(pageField(page)).toHaveValue('20');
  await expect(page.getByRole('slider', { name: 'Book map' })).toHaveAttribute('aria-valuenow', '20');
  await expect(page.locator('.reader__viewport')).toBeFocused();

  // Neither the open map nor its card ever covers the Return pill.
  const pill = page.getByRole('button', { name: /Return to p\. 1/ });
  await expect(pill).toBeVisible();
  const bottom = await mapPoint(page, PAGES - 0.5);
  await page.mouse.move(bottom.x, bottom.y);
  await expect(page.locator('.book-map-card')).toContainText('p. 36');
  const pillBox = (await pill.boundingBox())!;
  for (const selector of ['.book-map', '.book-map-card']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.x).toBeGreaterThan(pillBox.x + pillBox.width);
  }
  const onTop = await pill.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  });
  expect(onTop).toBe(true);

  await pill.click();
  await expect(pageField(page)).toHaveValue('1');
});

test('the pointer snaps to a nearby note; a click lands on the note and flashes it', async ({ page }) => {
  await goToPage(page, 25);
  await addNote(page, 'Energy is conserved here');
  await goToPage(page, 1);

  const mark = page.locator('.book-map__note');
  await expect(mark).toHaveCount(1);
  const markY = Number(await mark.getAttribute('cy'));
  const track = (await page.locator('.book-map__track').boundingBox())!;
  const x = track.x + track.width - 12;

  // Close to the mark the card shows the note: that's what a click lands on.
  await page.mouse.move(x, track.y + markY + 4);
  const items = page.locator('.book-map-card__items li');
  await expect(items).toHaveText(['Energy is conserved here']);
  await expect(page.locator('.book-map__lens')).toBeVisible();
  // Farther away it lets go and previews pages again.
  await page.mouse.move(x, track.y + markY + 12);
  await expect(page.locator('.book-map-card')).toContainText('of 36');
  await expect(items).toHaveCount(0);

  await page.mouse.move(x, track.y + markY - 4);
  await expect(items).toHaveCount(1);
  await page.mouse.down();
  await page.mouse.up();
  await expect(pageField(page)).toHaveValue('25');
  const note = page.locator('.margin-note', { hasText: 'Energy is conserved here' });
  await expect(note).toHaveClass(/is-pulsing/);
  const noteBox = (await note.boundingBox())!;
  const viewportBox = (await page.locator('.reader__viewport').boundingBox())!;
  expect(noteBox.y).toBeGreaterThan(viewportBox.y);
  expect(noteBox.y + noteBox.height).toBeLessThan(viewportBox.y + viewportBox.height / 2);
  await expect(page.getByRole('button', { name: /Return to p\. 1/ })).toBeVisible();
});

test('dragging the window scrubs; letting go leaves one way back and Esc cancels', async ({ page }) => {
  const window = (await page.locator('.book-map__window').boundingBox())!;
  await page.mouse.move(window.x + window.width / 2, window.y + window.height / 2);
  await page.mouse.down();
  const middle = await mapPoint(page, 15.5);
  await page.mouse.move(middle.x, middle.y, { steps: 12 });
  await expect(page.locator('.book-map')).toHaveClass(/is-dragging/);
  await expect(page.locator('.book-map-card.is-compact')).toBeVisible();
  await expect.poll(() => currentPage(page)).toBeGreaterThan(10);
  await page.mouse.up();
  const landed = await currentPage(page);
  expect(landed).toBeGreaterThanOrEqual(14);
  expect(landed).toBeLessThanOrEqual(17);
  await expect(page.getByRole('button', { name: /Return to p\. 1/ })).toBeVisible();

  // Esc mid-scrub goes back to where the scrub began, and records nothing.
  const again = (await page.locator('.book-map__window').boundingBox())!;
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await page.mouse.down();
  const late = await mapPoint(page, 31.5);
  await page.mouse.move(late.x, late.y, { steps: 10 });
  await expect.poll(() => currentPage(page)).toBeGreaterThan(25);
  await page.keyboard.press('Escape');
  await expect(pageField(page)).toHaveValue(String(landed));
  await page.mouse.up();
  await expect(pageField(page)).toHaveValue(String(landed));

  // The first scrub left exactly one step of history.
  await page.getByRole('button', { name: /^Back to page 1/ }).click();
  await expect(pageField(page)).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Back (Alt+Left)' })).toBeDisabled();
});

test('the map is a slider: arrows step pages, PageUp/PageDown chapters, Enter goes', async ({ page }) => {
  const map = page.getByRole('slider', { name: 'Book map' });
  await map.focus();
  await page.keyboard.press('ArrowDown');
  await expect(map).toHaveAttribute('aria-valuenow', '2');
  await expect(page.locator('.book-map')).toHaveClass(/is-keyboard/);
  await expect(page.locator('.book-map-card')).toContainText('p. 2');
  await page.keyboard.press('PageDown');
  await expect(map).toHaveAttribute('aria-valuenow', '3');
  await page.keyboard.press('PageDown');
  await expect(map).toHaveAttribute('aria-valuetext', 'p. 11 of 36, 2.1 Inertia and Force');
  await page.keyboard.press('End');
  await expect(map).toHaveAttribute('aria-valuenow', '36');
  await page.keyboard.press('PageUp');
  await expect(map).toHaveAttribute('aria-valuenow', '35');
  await page.keyboard.press('Home');
  await expect(map).toHaveAttribute('aria-valuenow', '1');
  await expect(pageField(page)).toHaveValue('1');

  await page.keyboard.press('PageDown');
  await page.keyboard.press('PageDown');
  await page.keyboard.press('Enter');
  await expect(pageField(page)).toHaveValue('11');
  await expect(map).toBeFocused();
  await expect(page.getByRole('button', { name: /Return to p\. 1/ })).toBeVisible();

  // Esc drops a cursor that wasn't taken.
  await page.keyboard.press('ArrowDown');
  await expect(map).toHaveAttribute('aria-valuenow', '12');
  await page.keyboard.press('Escape');
  await expect(map).toHaveAttribute('aria-valuenow', '11');
});

test('turning the book map off gives the pages their scrollbar back', async ({ page }) => {
  // Headless Chromium hides scrollbars, so this reads the style that decides them.
  const scrollbar = () =>
    page.locator('.reader__viewport').evaluate((element) => getComputedStyle(element).scrollbarWidth);
  await expect(page.locator('html')).toHaveClass(/has-book-map/);
  expect(await scrollbar()).not.toBe('thin');

  await page.getByRole('button', { name: 'Appearance' }).click();
  const toggle = page.getByRole('switch', { name: /Book map/ });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.getByRole('slider', { name: 'Book map' })).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/has-book-map/);
  expect(await scrollbar()).toBe('thin');

  await toggle.click();
  await expect(page.getByRole('slider', { name: 'Book map' })).toBeVisible();
  expect(await scrollbar()).not.toBe('thin');
});

test('in focus mode the map recedes until the pointer reaches for it', async ({ page }) => {
  const map = page.locator('.book-map');
  const opacity = () => map.evaluate((element) => Number(getComputedStyle(element).opacity));
  await page.evaluate(() => document.documentElement.classList.add('focus-mode'));
  await expect.poll(opacity).toBeLessThan(0.5);
  const point = await mapPoint(page, 10.5);
  await page.mouse.move(point.x, point.y);
  await expect.poll(opacity).toBe(1);
});
