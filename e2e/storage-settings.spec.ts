import { expect, test, type Page } from '@playwright/test';
import { backToLibrary, importFixture } from './support/reader';

async function openDialog(page: Page) {
  await page.getByRole('button', { name: 'Library and storage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Library & storage' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('Library & storage opens from the library, explains itself and returns focus on Escape', async ({
  page,
}) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Library and storage' });
  const dialog = await openDialog(page);
  for (const section of ['Library folder', 'This device', 'Backups', 'Storage']) {
    await expect(dialog.getByRole('heading', { name: section, exact: true })).toBeVisible();
  }
  await expect(
    dialog.getByText(/Clearing this site’s data in your browser removes books you imported here/),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Export backup' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('the reader reaches Library & storage from the Appearance menu', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('button', { name: 'Library & storage…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Library & storage' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Close library and storage' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Appearance' })).toBeFocused();
  await backToLibrary(page);
});

test('the device name is kept across reloads', async ({ page }) => {
  await page.goto('/');
  const dialog = await openDialog(page);
  const name = dialog.getByLabel('Device name');
  await expect(name).not.toHaveValue('');
  await name.fill('Kitchen iPad');
  await name.press('Enter');
  await expect(dialog.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect((await openDialog(page)).getByLabel('Device name')).toHaveValue('Kitchen iPad');
});
