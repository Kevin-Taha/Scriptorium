/**
 * Google sign-in for Drive sync through Google Identity Services' token model: a static site gets
 * short-lived access tokens (about an hour) and no refresh tokens, and Google only opens its sign-in
 * window from a click. When a token runs out, folder sync reports that it needs permission again and
 * the reader reconnects with one click, exactly as with a local folder after a browser restart.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
/** Treat tokens as expired a little early, so a sync pass doesn't start with seconds left. */
const EXPIRY_MARGIN_MS = 2 * 60_000;

const APPROVAL_HINT = 'Drive sync only works for Google accounts the owner of this site has approved.';

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(override?: { prompt?: string; login_hint?: string }): void;
}

/** The slice of `google.accounts.oauth2` used here. */
export interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback(response: TokenResponse): void;
    error_callback?(error: { type?: string; message?: string }): void;
  }): TokenClient;
  hasGrantedAllScopes(response: TokenResponse, firstScope: string, ...restScopes: string[]): boolean;
}

export interface GoogleAuthOptions {
  clientId: string;
  scope: string;
  /** Loads Google Identity Services; replaced in tests. */
  load?(): Promise<GoogleOAuth2>;
  now?(): number;
}

export class GoogleAuth {
  private token: { value: string; expiresAt: number } | null = null;
  private hint: string | undefined;
  private oauth: GoogleOAuth2 | null = null;
  private loading: Promise<GoogleOAuth2> | null = null;
  private client: TokenClient | null = null;
  private pending: { resolve(): void; reject(error: Error): void } | null = null;

  constructor(private readonly options: GoogleAuthOptions) {}

  /** Starts loading Google's script early, so a later click can open the sign-in window at once. */
  preload(): void {
    if (this.options.clientId) void this.load().catch(() => undefined);
  }

  /** The current access token, or null once it has (nearly) expired. */
  accessToken(): string | null {
    const now = (this.options.now ?? Date.now)();
    return this.token && this.token.expiresAt - EXPIRY_MARGIN_MS > now ? this.token.value : null;
  }

  /** Forgets a token Google rejected. */
  invalidate(): void {
    this.token = null;
  }

  /** The account to sign in with next time, so Google can skip its account chooser. */
  setAccountHint(email: string | undefined): void {
    this.hint = email || undefined;
  }

  /**
   * Gets a fresh access token. Call from a click: Google opens a sign-in window, which closes by
   * itself when the reader has already allowed access. Rejects with a message for the reader.
   */
  authorize(): Promise<void> {
    if (!this.options.clientId)
      return Promise.reject(new Error('Google Drive isn’t set up for this copy of Scriptorium.'));
    // Without an await before it, the sign-in window opens inside the click and isn't blocked.
    return this.oauth ? this.request(this.oauth) : this.load().then((oauth) => this.request(oauth));
  }

  private load(): Promise<GoogleOAuth2> {
    this.loading ??= (this.options.load ?? loadIdentityServices)().then(
      (oauth) => (this.oauth = oauth),
      (error: unknown) => {
        this.loading = null;
        throw error;
      },
    );
    return this.loading;
  }

  private request(oauth: GoogleOAuth2): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // A new click supersedes a sign-in that never reported back.
      this.pending?.reject(new DOMException('Sign-in was started again.', 'AbortError'));
      this.pending = { resolve, reject };
      this.client ??= oauth.initTokenClient({
        client_id: this.options.clientId,
        scope: this.options.scope,
        callback: (response) => this.settle(this.accept(oauth, response)),
        error_callback: (error) => this.settle(describeSignInError(error.type)),
      });
      this.client.requestAccessToken(this.hint ? { prompt: '', login_hint: this.hint } : { prompt: '' });
    });
  }

  private accept(oauth: GoogleOAuth2, response: TokenResponse): Error | null {
    if (response.error || !response.access_token) {
      return new Error(
        response.error === 'access_denied'
          ? `Google didn’t give Scriptorium access to your Drive. ${APPROVAL_HINT}`
          : `Google sign-in didn’t finish. ${APPROVAL_HINT}`,
      );
    }
    if (!oauth.hasGrantedAllScopes(response, this.options.scope)) {
      return new Error(
        'Scriptorium needs permission to see and save files in Google Drive. Sign in again and allow it.',
      );
    }
    const seconds = Number(response.expires_in) || 3600;
    this.token = {
      value: response.access_token,
      expiresAt: (this.options.now ?? Date.now)() + seconds * 1000,
    };
    return null;
  }

  private settle(error: Error | null): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    if (error) pending.reject(error);
    else pending.resolve();
  }
}

function describeSignInError(type: string | undefined): Error {
  switch (type) {
    case 'popup_failed_to_open':
      return new Error(
        'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
      );
    case 'popup_closed':
      return new Error(`Google sign-in was closed before it finished. ${APPROVAL_HINT}`);
    default:
      return new Error(`Google sign-in didn’t finish. ${APPROVAL_HINT}`);
  }
}

type GoogleGlobal = { google?: { accounts?: { oauth2?: GoogleOAuth2 } } };

function loadIdentityServices(): Promise<GoogleOAuth2> {
  const loaded = (window as GoogleGlobal).google?.accounts?.oauth2;
  if (loaded) return Promise.resolve(loaded);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const oauth = (window as GoogleGlobal).google?.accounts?.oauth2;
      if (oauth) resolve(oauth);
      else reject(new Error('Google sign-in didn’t load. Try again.'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Couldn’t reach Google. Check your connection and try again.'));
    };
    document.head.append(script);
  });
}
