import { expect, type Locator, type Page } from '@playwright/test';
import { FIXTURE_PDF } from './paths';

export const TITLE = 'Principles of Classical Mechanics';

export async function importFixture(page: Page, fixture = FIXTURE_PDF): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Begin your library' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByRole('toolbar', { name: 'Reader' })).toBeVisible();
  await expect(page.locator('.page-sheet[data-page="1"] canvas')).toBeVisible();
}

export async function goToPage(page: Page, number: number): Promise<void> {
  const field = page.locator('#page-field');
  await field.fill(String(number));
  await field.press('Enter');
  await expect(field).toHaveValue(String(number));
  await expect(page.locator(`.page-sheet[data-page="${number}"] canvas`)).toBeVisible();
}

export async function backToLibrary(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
}

/** Opens the reader's Appearance menu (theme, zoom, focus mode, reading aids) unless it is open. */
export async function openAppearance(page: Page): Promise<Locator> {
  const button = page.getByRole('button', { name: 'Appearance' });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  const menu = page.getByRole('dialog', { name: 'Appearance' });
  await expect(menu).toBeVisible();
  return menu;
}

/** One step of zoom in from the Appearance menu, which is closed again afterwards. */
export async function zoomIn(page: Page): Promise<void> {
  const menu = await openAppearance(page);
  await menu.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}

export async function addNote(page: Page, text: string): Promise<void> {
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('n');
  const editor = page.getByRole('textbox', { name: /Note text, page/ });
  await expect(editor).toBeFocused();
  await editor.fill(text);
  await editor.press('Escape');
  await expect(page.locator('.margin-note').filter({ hasText: text })).toBeVisible();
}

export async function waitForProgressSave(page: Page): Promise<void> {
  // Reading progress is saved after a 400 ms debounce.
  await page.waitForTimeout(700);
}
