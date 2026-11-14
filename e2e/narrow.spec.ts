import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_PDF, LABELLED_FIXTURE_PDF } from './support/paths';
import { backToLibrary, goToPage, importFixture, waitForProgressSave } from './support/reader';

const TABLET = { width: 820, height: 1180 };
const PHONE = { width: 390, height: 844 };

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const viewport = page.locator('.reader__viewport');
  const overflow = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every visible toolbar control lies inside the window, none overlapping the next. */
async function expectToolbarFits(page: Page): Promise<void> {
  const boxes = await page.getByRole('toolbar', { name: 'Reader' }).evaluate((toolbar) =>
    [...toolbar.querySelectorAll('button, input')]
      .filter((el) => el.checkVisibility() && !el.closest('.chapter-progress'))
      .map((el) => el.getBoundingClientRect())
      .map(({ left, right }) => ({ left, right }))
      .sort((a, b) => a.left - b.left),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(5);
  for (const [i, box] of boxes.entries()) {
    expect(box.left).toBeGreaterThanOrEqual(i === 0 ? 0 : boxes[i - 1].right);
    expect(box.right).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
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

  test('the toolbar fits, with Go to as an icon and history and review in More', async ({ page }) => {
    await importFixture(page);
    await expectToolbarFits(page);
    await expect(page.locator('.reader__review-btn')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Back (Alt+Left)' })).toBeHidden();

    await page.getByRole('button', { name: /Go to a page, chapter or note$/ }).tap();
    const dialog = page.getByRole('dialog', { name: 'Go to' });
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    await dialog.getByRole('combobox').fill('9');
    await dialog.getByRole('combobox').press('Enter');
    const field = page.locator('#page-field');
    await expect(field).toHaveValue('9');

    const more = page.getByRole('button', { name: 'More', exact: true });
    await more.tap();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const forwardDisabled = page.getByRole('button', { name: 'Forward', exact: true });
    await expect(forwardDisabled).toBeDisabled();
    // Tapping a disabled row leaves the menu open rather than dismissing on blur.
    const disabledBox = (await forwardDisabled.boundingBox())!;
    await page.touchscreen.tap(disabledBox.x + disabledBox.width / 2, disabledBox.y + disabledBox.height / 2);
    await expect(more).toHaveAttribute('aria-expanded', 'true');

    await page.getByRole('button', { name: 'Back to p. 1' }).tap();
    await expect(field).toHaveValue('1');
    await expect(more).toHaveAttribute('aria-expanded', 'false');

    // Safari blurs a focused trigger to null on mousedown before click when tapping a button;
    // the menu must stay mounted through mousedown so the item's click still runs.
    await more.focus();
    await more.tap();
    const forward = page.getByRole('button', { name: 'Forward to p. 9' });
    await more.evaluate((el) => el.blur());
    await forward.tap();
    await expect(field).toHaveValue('9');

    // Tabbing past the last item closes the menu onto the next control.
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Review notes (0)' }).focus();
    await page.keyboard.press('Tab');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.chapter-progress__segment[tabindex="0"]')).toBeFocused();

    // Rotating or widening past the phone breakpoint closes the hidden menu so Esc isn't trapped.
    await more.tap();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(
      page.getByRole('button', { name: 'More', exact: true, includeHidden: true }),
    ).toHaveAttribute('aria-expanded', 'false');
    await page.setViewportSize(PHONE);
    await expect(more).toHaveAttribute('aria-expanded', 'false');

    // A tap elsewhere closes the menu without acting.
    await more.tap();
    await page.touchscreen.tap(PHONE.width / 2, PHONE.height / 2);
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(field).toHaveValue('9');

    // Esc closes it onto its button, even when the tap left focus elsewhere (as Safari does),
    // and goes no further: the Return pill stays.
    await page.locator('.reader__viewport').focus();
    await more.dispatchEvent('click');
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(more).toBeFocused();
    await expect(page.locator('.return-pill')).toBeVisible();

    await more.tap();
    await page.getByRole('button', { name: 'Review notes (0)' }).tap();
    await expect(page.getByRole('heading', { name: 'Nothing to review yet' })).toBeVisible();
  });

  test('the toolbar fits the smallest phones, printed page labels and long books included', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await importFixture(page, LABELLED_FIXTURE_PDF);
    await expectToolbarFits(page);
    await expect(page.locator('#page-field')).toBeVisible();

    await backToLibrary(page);
    await page.locator('input[type=file]').setInputFiles(FIXTURE_PDF);
    await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
    await page.locator('.page-field__total').evaluate((el) => {
      el.textContent = '/ 1312';
    });
    await expectToolbarFits(page);
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
