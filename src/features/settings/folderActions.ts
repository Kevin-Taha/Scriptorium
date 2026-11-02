import { useSyncStore } from '@/features/sync/syncStore';
import { requestPersistenceQuietly } from './storageStatus';

/**
 * The folder-sync actions as the UI runs them: each resolves to a message to show
 * the reader when it failed, or null. Dismissing the folder picker isn't a failure.
 */

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

async function attempt(action: () => Promise<void>): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (error) {
    if (isAbort(error)) return null;
    return error instanceof Error && error.message ? error.message : FALLBACK_MESSAGE;
  }
}

export async function linkLibraryFolder(): Promise<string | null> {
  return linkWith(() => useSyncStore.getState().linkFolder());
}

/** Links a folder in Google Drive: signs in (from this click), then the reader chooses the folder. */
export async function linkDriveLibraryFolder(): Promise<string | null> {
  return linkWith(() => useSyncStore.getState().linkDriveFolder());
}

async function linkWith(link: () => Promise<void>): Promise<string | null> {
  const message = await attempt(link);
  if (!message && useSyncStore.getState().folder) requestPersistenceQuietly();
  return message;
}

export function reconnectLibraryFolder(): Promise<string | null> {
  return attempt(() => useSyncStore.getState().reconnect());
}

export function unlinkLibraryFolder(): Promise<string | null> {
  return attempt(() => useSyncStore.getState().unlinkFolder());
}

export function syncLibraryFolderNow(): Promise<string | null> {
  return attempt(() => useSyncStore.getState().syncNow());
}
