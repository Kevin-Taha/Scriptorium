import { expect, type Page, test } from '@playwright/test';
import { importFixture } from './support/reader';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });

async function expectDialogOpensAndCloses(page: Page) {
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
}

test('? opens every shortcut, grouped, and the pointer ways, from the library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();
  await page.keyboard.press('?');
  await expect(dialog(page)).toBeVisible();
  for (const group of ['Navigate', 'Search', 'Read', 'Annotate', 'Writing a note', 'Notes review']) {
    await expect(dialog(page).getByRole('heading', { name: group, exact: true })).toBeVisible();
  }
  await expect(dialog(page).getByRole('region', { name: 'Without the keyboard' })).toContainText(
    'Click the margin beside a page',
  );
  await expect(dialog(page).getByRole('region', { name: 'Read' })).toContainText('Zoom in');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
});

test('the reader toolbar and the review both open the shortcuts', async ({ page }) => {
  await importFixture(page);
  const toolbarButton = page
    .getByRole('toolbar', { name: 'Reader' })
    .getByRole('button', { name: 'Keyboard shortcuts' });
  await expect(toolbarButton).toHaveAttribute('data-tooltip', 'Keyboard shortcuts (?)');
  await expect(toolbarButton).toHaveAttribute('aria-keyshortcuts', '?');
  await toolbarButton.click();
  await expectDialogOpensAndCloses(page);
  await expect(toolbarButton).toBeFocused();

  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('[');
  await expect(page.locator('.reader')).toHaveAttribute('data-sidebar-open', 'false');
  await toolbarButton.click();
  await expectDialogOpensAndCloses(page);

  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('f');
  await expect(page.locator('html')).toHaveClass(/focus-mode/);
  await page.keyboard.press('?');
  await expectDialogOpensAndCloses(page);
  await expect(page.locator('html')).toHaveClass(/focus-mode/);
  await page.keyboard.press('f');

  await page.keyboard.press('Shift+R');
  const review = page.getByRole('toolbar', { name: 'Notes review' });
  await expect(review).toBeVisible();
  await page.keyboard.press('?');
  await expectDialogOpensAndCloses(page);
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expectDialogOpensAndCloses(page);
});

test('toolbar controls carry their keys in tooltips and aria-keyshortcuts', async ({ page }) => {
  await importFixture(page);
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
  const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
  await expect(zoomIn).toHaveAttribute('data-tooltip', 'Zoom in (+)');
  await expect(zoomIn).toHaveAttribute('aria-keyshortcuts', 'Plus =');
  await expect(zoomOut).toHaveAttribute('data-tooltip', 'Zoom out (−)');
  await expect(zoomOut).toHaveAttribute('aria-keyshortcuts', '-');
  await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute(
    'aria-keyshortcuts',
    '[',
  );
  await expect(page.getByRole('button', { name: /^Review notes/ })).toHaveAttribute(
    'data-tooltip',
    'Review all notes (Shift+R)',
  );
  await page.getByRole('button', { name: /^Zoom level/ }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Fit width' })).toHaveAttribute(
    'aria-keyshortcuts',
    '0',
  );
});

test('a ribbon on the page corner bookmarks the page', async ({ page }) => {
  await importFixture(page);
  const sheet = page.locator('.page-sheet[data-page="1"]');
  const ribbon = page.getByRole('button', { name: 'Bookmark page 1' });
  const ghostOpacity = () =>
    ribbon.evaluate((element) => Number(getComputedStyle(element, '::before').opacity));
  const box = (await sheet.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(sheet).not.toHaveAttribute('data-ribbon-reveal');
  await expect.poll(ghostOpacity).toBe(0);
  await page.mouse.move(box.x + box.width - 100, box.y + 60);
  await expect(sheet).toHaveAttribute('data-ribbon-reveal');
  await expect.poll(ghostOpacity).toBeGreaterThan(0.2);
  await expect(ribbon).toHaveAttribute('data-tooltip', 'Bookmark this page (B)');

  await ribbon.click();
  await expect(ribbon).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.locator('.page-sheet__ribbon')).toBeVisible();
  await expect(ribbon).toHaveAttribute('data-tooltip', 'Remove bookmark (B)');
  await page.getByRole('tab', { name: 'Bookmarks' }).click();
  await expect(page.locator('.bookmark-list__item')).toHaveCount(1);

  await ribbon.click();
  await expect(ribbon).toHaveAttribute('aria-pressed', 'false');
  await expect(sheet.locator('.page-sheet__ribbon')).toHaveCount(0);
  await expect(page.locator('.bookmark-list__item')).toHaveCount(0);
  await expect(ribbon).not.toBeFocused();
});
