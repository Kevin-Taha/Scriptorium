import { expect, test } from '@playwright/test';
import { addNote, goToPage, importFixture } from './support/reader';

test('the build enforces a strict Content-Security-Policy that reading, notes and focus mode stay within', async ({
  page,
}) => {
  const violations: string[] = [];
  await page.exposeFunction('reportCspViolation', (violation: string) => violations.push(violation));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) =>
      (window as unknown as { reportCspViolation(violation: string): void }).reportCspViolation(
        `${event.effectiveDirective}: ${event.blockedURI || 'inline'}`,
      ),
    );
  });

  await importFixture(page);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /script-src 'self' 'sha256-[A-Za-z0-9+/=]+';.*style-src 'self';/,
  );

  await goToPage(page, 8);
  await expect(page.locator('.page-sheet[data-page="8"] .textLayer span').first()).toBeVisible();
  await addNote(page, 'Within policy');

  // Focus mode's spotlight is a runtime style rule, which an inline <style> would break.
  await page.locator('.reader__viewport').focus();
  await page.keyboard.press('f');
  await expect(page.locator('html')).toHaveClass(/focus-mode/);
  await expect
    .poll(() =>
      page
        .locator('.reader__page')
        .evaluateAll((rows) => rows.some((row) => getComputedStyle(row).opacity === '0.45')),
    )
    .toBe(true);

  expect(violations).toEqual([]);
});
