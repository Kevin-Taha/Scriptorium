/**
 * Google Drive sync is opt-in per build: it needs an OAuth client id from the site owner's
 * Google Cloud project (see docs/DATA.md). Without one, nothing about Drive is shown or loaded.
 */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

/**
 * Full Drive access: reading the PDFs already in a folder the reader chooses, and saving notes in a
 * `.scriptorium` folder inside it, needs more than per-file access. Google treats this scope as
 * restricted, so until the app is verified only accounts the owner adds as test users can sign in.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export function isDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID !== '';
}
