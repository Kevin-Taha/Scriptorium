import { expect, type Page, test } from '@playwright/test';
import { addNote, backToLibrary, goToPage, importFixture } from './support/reader';

const html = (page: Page) => page.locator('html');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Reader' });
const focusButton = (page: Page) => page.getByRole('button', { name: 'Focus mode' });
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Sidebar' });

async function readOnPage(page: Page, number: number): Promise<void> {
  await importFixture(page);
  await goToPage(page, number);
  await page.locator('.reader__viewport').focus();
}

/** The page row that sits at the vertical centre of the document area. */
function centreRowNumber(page: Page): Promise<number> {
  return page.evaluate(() => {
    const view = document.querySelector('.reader__viewport')!.getBoundingClientRect();
    const middle = view.top + view.height / 2;
    const row = [...document.querySelectorAll<HTMLElement>('.reader__page')].find((element) => {
      const box = element.getBoundingClientRect();
      return box.top <= middle && box.bottom >= middle;
    });
    return Number(row?.dataset.page);
  });
}

test('F enters focus mode, keeps your page, brings the toolbar back at the top edge, and Esc leaves', async ({
  page,
}) => {
  await readOnPage(page, 14);
  await expect(sidebar(page)).toBeVisible();
  await expect(focusButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(focusButton(page)).toHaveAttribute('aria-keyshortcuts', 'F');

  await page.keyboard.press('f');
  await expect(html(page)).toHaveClass(/focus-mode/);
  await expect(focusButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(sidebar(page)).toHaveCount(0);
  await expect(toolbar(page)).toHaveCSS('opacity', '0');
  const hint = page.locator('.focus-hint-region');
  await expect(hint).toContainText('Move to the top edge for controls');
  await expect(hint).toContainText('F or Esc to leave');
  await expect(page.locator('#page-field')).toHaveValue('14');
  await expect(page.locator('.page-sheet[data-page="14"] canvas')).toBeVisible();

  // The pointer reaching the top edge brings the toolbar back over the page, and it lets go again.
  await page.mouse.move(700, 400);
  await page.mouse.move(700, 10);
  await expect(toolbar(page)).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
  await page.mouse.move(700, 400);
  await expect(toolbar(page)).toHaveCSS('opacity', '0');

  await page.keyboard.press('Escape');
  await expect(html(page)).not.toHaveClass(/focus-mode/);
  await expect(sidebar(page)).toBeVisible();
  await expect(toolbar(page)).toHaveCSS('opacity', '1');
  await expect(page.locator('#page-field')).toHaveValue('14');
  await expect(page.locator('.page-sheet[data-page="14"] canvas')).toBeVisible();

  await page.keyboard.press('f');
  await expect(html(page)).toHaveClass(/focus-mode/);
  await page.keyboard.press('f');
  await expect(html(page)).not.toHaveClass(/focus-mode/);
  await expect(sidebar(page)).toBeVisible();
  await expect(page.locator('#page-field')).toHaveValue('14');
});

test('Esc that closes the selection toolbar stays in focus mode', async ({ page }) => {
  await readOnPage(page, 14);
  await page.keyboard.press('f');
  await expect(html(page)).toHaveClass(/focus-mode/);

  const line = page.locator('.page-sheet[data-page="14"] .textLayer span').nth(4);
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const selectionToolbar = page.getByRole('toolbar', { name: 'Selection actions' });
  await expect(selectionToolbar).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(selectionToolbar).toHaveCount(0);
  await expect(html(page)).toHaveClass(/focus-mode/);
  await page.keyboard.press('Escape');
  await expect(html(page)).not.toHaveClass(/focus-mode/);
});

test('a sidebar that was closed stays closed, and the toolbar button reflects and toggles focus mode', async ({
  page,
}) => {
  await readOnPage(page, 6);
  await page.keyboard.press('[');
  await expect(sidebar(page)).toHaveCount(0);

  await focusButton(page).click();
  await expect(html(page)).toHaveClass(/focus-mode/);
  await expect(focusButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(toolbar(page)).toHaveCSS('opacity', '0');

  // The pointer is still up at the button: wiggling there doesn't bounce the toolbar back…
  await page.mouse.move(640, 14);
  await page.mouse.move(660, 18);
  await page.waitForTimeout(400);
  await expect(toolbar(page)).toHaveCSS('opacity', '0');

  // …but leaving the top edge and returning does.
  await page.mouse.move(660, 400);
  await page.mouse.move(660, 14);
  await expect(toolbar(page)).toHaveCSS('opacity', '1');
  await focusButton(page).click();
  await expect(html(page)).not.toHaveClass(/focus-mode/);
  await expect(focusButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(sidebar(page)).toHaveCount(0);
  await expect(page.locator('#page-field')).toHaveValue('6');
});

test('keyboard focus brings the toolbar back, and leaving the reader ends focus mode', async ({ page }) => {
  await readOnPage(page, 3);
  await page.keyboard.press('f');
  await expect(toolbar(page)).toHaveCSS('opacity', '0');

  await page.keyboard.press('Shift+Tab');
  await expect(toolbar(page)).toHaveCSS('opacity', '1');

  await backToLibrary(page);
  await expect(html(page)).not.toHaveClass(/focus-mode/);
});

test('focus mode dims the other pages and fades margin notes until their page is hovered', async ({
  page,
}) => {
  await readOnPage(page, 8);
  await addNote(page, 'Spotlight me');
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('f');
  await page.mouse.move(4, 500);

  const note = page.locator('.margin-note').filter({ hasText: 'Spotlight me' });
  await expect(note).toHaveCSS('opacity', '0.3');
  await expect(page.locator('.margin-note__anchor').first()).toHaveCSS('opacity', '1');
  await page.mouse.move(400, 500);
  await expect(note).toHaveCSS('opacity', '1');

  const opacityOfRow = (number: number) =>
    page.locator(`.reader__page[data-page="${number}"]`).evaluate((row) => getComputedStyle(row).opacity);
  const centre = await centreRowNumber(page);
  await expect.poll(() => opacityOfRow(centre)).toBe('1');
  await expect.poll(() => opacityOfRow(centre + 1)).toBe('0.45');

  // Scrolling on moves the spotlight with the page in the middle.
  await page
    .locator('.reader__viewport')
    .evaluate((element) => element.scrollBy(0, element.clientHeight * 1.5));
  await expect.poll(() => centreRowNumber(page)).toBeGreaterThan(centre);
  const next = await centreRowNumber(page);
  await expect.poll(() => opacityOfRow(next)).toBe('1');
  await expect.poll(() => opacityOfRow(centre)).not.toBe('1');

  await page.keyboard.press('Escape');
  await expect(page.locator(`.reader__page[data-page="${next}"]`)).toHaveCSS('opacity', '1');
  await expect(page.locator(`.reader__page[data-page="${centre}"]`)).toHaveCSS('opacity', '1');
  await expect(note).toHaveCSS('opacity', '1');
});

test('R toggles the reading ruler, the Appearance switch reflects it, and it survives a reload', async ({
  page,
}) => {
  await readOnPage(page, 5);
  const ruler = page.locator('.reading-ruler');
  await expect(ruler).toHaveCount(0);

  await page.keyboard.press('r');
  await expect(ruler).toHaveCount(1);
  await page.getByRole('button', { name: 'Appearance' }).click();
  const setting = page.getByRole('switch', { name: /Reading ruler/ });
  await expect(setting).toBeChecked();

  await setting.uncheck();
  await expect(ruler).toHaveCount(0);
  await setting.check();
  await expect(ruler).toHaveCount(1);
  await page.keyboard.press('Escape');

  // The band follows the pointer.
  const top = await page.locator('.reader__main').evaluate((main) => main.getBoundingClientRect().top);
  await page.mouse.move(700, 420);
  await expect
    .poll(() => ruler.evaluate((element) => element.style.getPropertyValue('--ruler-y')))
    .toBe(`${420 - top}px`);

  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('.page-sheet canvas').first()).toBeVisible();
  await expect(ruler).toHaveCount(1);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect(page.getByRole('switch', { name: /Reading ruler/ })).toBeChecked();
  await page.keyboard.press('Escape');

  // It is its own feature: focus mode neither needs it nor turns it off.
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('f');
  await expect(ruler).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(ruler).toHaveCount(1);
  await page.keyboard.press('r');
  await expect(ruler).toHaveCount(0);
});
