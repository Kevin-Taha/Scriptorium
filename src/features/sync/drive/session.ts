import { DriveClient } from './api';
import { GoogleAuth } from './auth';
import { BookCache } from './bookCache';
import { DRIVE_SCOPE, GOOGLE_CLIENT_ID } from './config';

/** The signed-in Google session that every Drive folder handle shares. */
export interface DriveSession {
  auth: Pick<GoogleAuth, 'accessToken' | 'authorize' | 'preload' | 'setAccountHint'>;
  client: DriveClient;
  /** Books read from Drive, kept for instant and offline reopening. */
  books: BookCache;
}

let current: DriveSession | null = null;

export function driveSession(): DriveSession {
  if (!current) {
    const auth = new GoogleAuth({ clientId: GOOGLE_CLIENT_ID, scope: DRIVE_SCOPE });
    const client = new DriveClient({
      token: () => auth.accessToken(),
      onUnauthorized: () => auth.invalidate(),
    });
    current = { auth, client, books: new BookCache() };
  }
  return current;
}

/** Replaces the session (tests), or resets it with null. */
export function setDriveSession(session: DriveSession | null): void {
  current = session;
}

/** Starts loading Google's sign-in script once the reader shows interest, so their click opens it at once. */
export function preloadGoogleSignIn(): void {
  driveSession().auth.preload();
}
