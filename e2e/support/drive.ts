import type { Page } from '@playwright/test';
import type { FakeDrive } from '../../src/features/sync/drive/testing/fakeDrive';

/**
 * Google Identity Services, reduced to a token client that grants Drive access straight away,
 * as Google does once the reader has allowed access. Counts sign-in requests in `__signIns`.
 */
const IDENTITY_SERVICES = `
window.__signIns = 0;
window.google = { accounts: { oauth2: {
  initTokenClient: (config) => ({
    requestAccessToken: () => {
      window.__signIns++;
      setTimeout(() => config.callback({
        access_token: 'fake-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/drive',
      }), 50);
    },
  }),
  hasGrantedAllScopes: (response, ...scopes) =>
    scopes.every((scope) => (response.scope || '').split(' ').includes(scope)),
} } };
`;

/** Serves Google's sign-in library and the Drive API from `drive` instead of Google. */
export async function stubGoogle(page: Page, drive: FakeDrive): Promise<void> {
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: IDENTITY_SERVICES }),
  );
  await page.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const response = await drive.handle({
      method: request.method(),
      url: request.url(),
      headers: await request.allHeaders(),
      body: request.postDataBuffer(),
    });
    await route.fulfill({
      status: response.status,
      headers: response.headers,
      body: Buffer.from(response.body),
    });
  });
}

/** How many times the app asked Google for an access token on this page. */
export function signInCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __signIns?: number }).__signIns ?? 0);
}

/** Collects Content-Security-Policy violations, as `directive: blocked URI`. */
export async function watchCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('reportCspViolation', (violation: string) => violations.push(violation));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) =>
      (window as unknown as { reportCspViolation(violation: string): void }).reportCspViolation(
        `${event.effectiveDirective}: ${event.blockedURI || 'inline'}`,
      ),
    );
  });
  return violations;
}
