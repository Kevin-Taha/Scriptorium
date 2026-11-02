import { describe, expect, it, vi } from 'vitest';
import { GoogleAuth, type GoogleOAuth2 } from './auth';

const SCOPE = 'https://www.googleapis.com/auth/drive';

/** A stand-in for Google Identity Services whose sign-in window the test answers. */
function fakeIdentityServices() {
  let config: Parameters<GoogleOAuth2['initTokenClient']>[0] | null = null;
  const requests: unknown[] = [];
  const oauth: GoogleOAuth2 = {
    initTokenClient: (options) => {
      config = options;
      return { requestAccessToken: (override) => requests.push(override) };
    },
    hasGrantedAllScopes: (response, ...scopes) =>
      scopes.every((scope) => (response.scope ?? '').split(' ').includes(scope)),
  };
  return {
    oauth,
    requests,
    grant: (scope = SCOPE, expiresIn = 3600) =>
      config!.callback({ access_token: 'token-1', expires_in: expiresIn, scope }),
    deny: (error: string) => config!.callback({ error }),
    fail: (type: string) => config!.error_callback?.({ type }),
  };
}

function setup() {
  const gis = fakeIdentityServices();
  let now = 1_000_000;
  const load = vi.fn(async () => gis.oauth);
  const auth = new GoogleAuth({ clientId: 'client-id', scope: SCOPE, load, now: () => now });
  return { gis, auth, load, advance: (ms: number) => (now += ms) };
}

describe('GoogleAuth', () => {
  it('signs in from a click and keeps the token until shortly before it expires', async () => {
    const { gis, auth, advance } = setup();
    expect(auth.accessToken()).toBeNull();
    const signingIn = auth.authorize();
    await vi.waitFor(() => expect(gis.requests).toHaveLength(1));
    expect(gis.requests[0]).toEqual({ prompt: '' });
    gis.grant();
    await signingIn;
    expect(auth.accessToken()).toBe('token-1');
    advance(57 * 60_000);
    expect(auth.accessToken()).toBe('token-1');
    advance(2 * 60_000);
    expect(auth.accessToken()).toBeNull();
  });

  it('opens the sign-in window without waiting once Google’s script is loaded', async () => {
    const { gis, auth, load } = setup();
    auth.preload();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    const signingIn = auth.authorize();
    expect(gis.requests).toHaveLength(1);
    gis.grant();
    await signingIn;
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('skips Google’s account chooser for the remembered account', async () => {
    const { gis, auth } = setup();
    auth.setAccountHint('reader@example.com');
    const signingIn = auth.authorize();
    await vi.waitFor(() => expect(gis.requests).toHaveLength(1));
    expect(gis.requests[0]).toEqual({ prompt: '', login_hint: 'reader@example.com' });
    gis.grant();
    await signingIn;
  });

  it('explains refusals, closed windows and blocked pop-ups, mentioning approval', async () => {
    const { gis, auth } = setup();
    const cases: [() => void, RegExp][] = [
      [() => gis.deny('access_denied'), /didn’t give Scriptorium access.*approved/],
      [() => gis.fail('popup_closed'), /closed before it finished.*approved/],
      [() => gis.fail('popup_failed_to_open'), /blocked the Google sign-in window/],
      [() => gis.grant('openid'), /needs permission to see and save files/],
    ];
    for (const [answer, message] of cases) {
      const signingIn = auth.authorize();
      await vi.waitFor(() => expect(gis.requests.length).toBeGreaterThan(0));
      answer();
      await expect(signingIn).rejects.toThrow(message);
      gis.requests.length = 0;
    }
    expect(auth.accessToken()).toBeNull();
  });

  it('lets a new click take over from a sign-in that never finished', async () => {
    const { gis, auth } = setup();
    const first = auth.authorize();
    await vi.waitFor(() => expect(gis.requests).toHaveLength(1));
    const second = auth.authorize();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    gis.grant();
    await second;
    expect(auth.accessToken()).toBe('token-1');
  });

  it('forgets a token Google rejected', async () => {
    const { gis, auth } = setup();
    const signingIn = auth.authorize();
    await vi.waitFor(() => expect(gis.requests).toHaveLength(1));
    gis.grant();
    await signingIn;
    auth.invalidate();
    expect(auth.accessToken()).toBeNull();
  });

  it('tries loading Google’s script again after a failure', async () => {
    const gis = fakeIdentityServices();
    const load = vi
      .fn<() => Promise<GoogleOAuth2>>()
      .mockRejectedValueOnce(new Error('Couldn’t reach Google. Check your connection and try again.'))
      .mockResolvedValue(gis.oauth);
    const auth = new GoogleAuth({ clientId: 'client-id', scope: SCOPE, load });
    await expect(auth.authorize()).rejects.toThrow('Couldn’t reach Google');
    const signingIn = auth.authorize();
    await vi.waitFor(() => expect(gis.requests).toHaveLength(1));
    gis.grant();
    await signingIn;
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refuses to sign in when this build has no client id', async () => {
    const load = vi.fn();
    const auth = new GoogleAuth({ clientId: '', scope: SCOPE, load });
    auth.preload();
    await expect(auth.authorize()).rejects.toThrow('isn’t set up for this copy of Scriptorium');
    expect(load).not.toHaveBeenCalled();
  });
});
