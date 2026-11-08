import { expect, test, type Page } from '@playwright/test';
import { goToPage, importFixture, waitForProgressSave } from './support/reader';

const TABLET = { width: 820, height: 1180 };
const PHONE = { width: 390, height: 844 };

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const viewport = page.locator('.reader__viewport');
  const overflow = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('tablet', () => {
  test.use({ viewport: TABLET, hasTouch: true });

  test('the page takes the width, with notes on a rail beside it', async ({ page }) => {
    await importFixture(page);
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden();

    const sheet = await page.locator('.page-sheet[data-page="1"]').boundingBox();
    expect(sheet!.width).toBeGreaterThanOrEqual(0.88 * TABLET.width);
    await expectNoHorizontalScroll(page);
    await expect(page.locator('.margin-rail').first()).toBeAttached();
    await expect(page.locator('.margin-note-ghost .lucide-plus').first()).toBeAttached();
  });

  test('notes are written, read and closed from the rail', async ({ page }) => {
    await importFixture(page);
    await goToPage(page, 3);
    await page.locator('.reader__viewport').focus();
    await page.keyboard.press('n');
    const editor = page.getByRole('textbox', { name: /Note text, page/ });
    await expect(editor).toBeFocused();
    await editor.fill('Velocity is a vector');

    // Esc commits and leaves the card open and focused; a second Esc closes it onto its marker.
    await editor.press('Escape');
    const card = page.locator('.margin-note').filter({ hasText: 'Velocity is a vector' });
    await expect(card).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    const marker = page.getByRole('button', { name: /^Note on page \d+, amber: Velocity is a vector/ });
    await expect(marker).toBeFocused();
    await expect(marker).toHaveAttribute('aria-expanded', 'false');
    // The marker's whole 44px target stays clear of the book map on the right edge.
    const markerBox = (await marker.boundingBox())!;
    const mapBox = (await page.locator('.book-map').boundingBox())!;
    expect(markerBox.x + markerBox.width + 8).toBeLessThanOrEqual(mapBox.x);

    await marker.tap();
    await expect(card).toBeVisible();
    await expect(marker).toHaveAttribute('aria-expanded', 'true');
    // The open card lies over the page, clear of the window's edges.
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(TABLET.width);

    // A tap on the page closes it.
    const sheet = (await page.locator('.page-sheet[data-page="3"]').boundingBox())!;
    await page.touchscreen.tap(sheet.x + 40, sheet.y + 40);
    await expect(card).toBeHidden();

    await waitForProgressSave(page);
    await page.reload();
    await expect(page.getByRole('button', { name: /Velocity is a vector/ })).toBeVisible();
  });

  test('tapping empty rail starts a note there', async ({ page }) => {
    await importFixture(page);
    const rail = (await page.locator('.margin-rail[data-page="1"]').boundingBox())!;
    await page.touchscreen.tap(rail.x + rail.width / 2, rail.y + 200);
    const editor = page.getByRole('textbox', { name: 'Note text, page 1' });
    await expect(editor).toBeFocused();
    await editor.fill('From a tap');
    await editor.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Note on page 1, .*: From a tap/ })).toBeVisible();
  });

  test('the sidebar lies over the page and gets out of the way after a jump', async ({ page }) => {
    await importFixture(page);
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar).toBeVisible();
    await sidebar.locator('.outline__title', { hasText: 'Velocity' }).click();
    await expect(sidebar).toBeHidden();
    await expect(page.locator('#page-field')).toHaveValue('6');

    // Choosing where the reader already is still gets the sidebar out of the way.
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await sidebar.locator('.outline__title', { hasText: 'Velocity' }).click();
    await expect(sidebar).toBeHidden();

    // A press on the page also dismisses it.
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await expect(sidebar).toBeVisible();
    const sheet = (await page.locator('.page-sheet[data-page="6"]').boundingBox())!;
    await page.mouse.click(sheet.x + sheet.width - 40, sheet.y + 200);
    await expect(sidebar).toBeHidden();
  });
});

test.describe('phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('the page fits the screen without sideways scrolling', async ({ page }) => {
    await importFixture(page);
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeHidden();
    await expectNoHorizontalScroll(page);
    const sheet = (await page.locator('.page-sheet[data-page="1"]').boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(0);
    expect(sheet.width).toBeGreaterThanOrEqual(PHONE.width - 100);
  });
});

test('resizing across the breakpoint keeps the reading position and swaps cards for markers', async ({
  page,
}) => {
  await importFixture(page);
  await goToPage(page, 9);
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('n');
  const editor = page.getByRole('textbox', { name: /Note text, page/ });
  await editor.fill('Survives a resize');
  await editor.press('Escape');
  const card = page.locator('.margin-note').filter({ hasText: 'Survives a resize' });
  await expect(card).toBeVisible();
  await page.locator('.reader__viewport').focus();
  const field = page.locator('#page-field');
  await expect(field).toHaveValue('9');

  await page.setViewportSize(TABLET);
  await expect(page.locator('.margin-rail').first()).toBeAttached();
  await expect(card).toBeHidden();
  await expect(page.getByRole('button', { name: /Survives a resize/ })).toBeVisible();
  await expect(field).toHaveValue('9');

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.margin-rail')).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(field).toHaveValue('9');
});

test('a note being written stays in edit when the margin switches to the rail', async ({ page }) => {
  await importFixture(page);
  await goToPage(page, 4);
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('n');
  const editor = page.getByRole('textbox', { name: /Note text, page/ });
  await editor.fill('Half written');

  await page.setViewportSize(TABLET);
  await expect(page.locator('.margin-rail').first()).toBeAttached();
  // Give the replaced card's unmount a frame to (not) commit the edit.
  await page.waitForTimeout(300);
  await expect(editor).toBeVisible();
  await expect(editor).toHaveText('Half written');
  await expect(page.locator('.margin-note.is-editing')).toHaveCount(1);
});
