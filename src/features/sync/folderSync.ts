import { showToast } from '@/components/Toast';
import { onLibraryChange } from '@/lib/storage/repository';
import { onBookDataMerged } from '@/lib/sync/apply';
import { onDeviceRenamed } from '@/lib/sync/device';
import { FolderSyncEngine } from './engine';
import { provideFolderAccess } from './folderAccess';
import { extractBookMetadata } from './metadata';
import { startProgressNotices } from './progressNotice';
import { useSyncStore } from './syncStore';

const PERIODIC_SYNC_MS = 60_000;

let engine: FolderSyncEngine | null = null;

/**
 * Starts linked-folder sync once per page: restores the linked folder, wires
 * the sync store's actions, and syncs on focus, when the page becomes
 * visible, and every minute while it stays visible. Pending local edits are
 * written when the page is hidden.
 */
export function startFolderSync(): Promise<void> {
  if (engine) return Promise.resolve();
  const sync = new FolderSyncEngine({
    extractMetadata: extractBookMetadata,
    notify: (message, tone) => showToast(message, { tone }),
  });
  engine = sync;
  provideFolderAccess(sync);
  useSyncStore.setState({
    linkFolder: () => sync.link(),
    linkDriveFolder: () => sync.link('google-drive'),
    reconnect: () => sync.reconnect(),
    unlinkFolder: () => sync.unlink(),
    syncNow: () => sync.sync(),
  });
  onLibraryChange(({ docId }) => sync.noteLocalChange(docId));
  // Merges from a restored backup (or this engine's own pulls) must reach the folder too;
  // writes are skipped when nothing changed, so this can't loop.
  onBookDataMerged((docId) => sync.noteLocalChange(docId));
  onDeviceRenamed(() => sync.deviceRenamed());
  startProgressNotices();

  window.addEventListener('focus', () => sync.syncInBackground());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync.syncInBackground();
    else void sync.flushWrites();
  });
  window.addEventListener('pagehide', () => void sync.flushWrites());
  setInterval(() => {
    if (document.visibilityState === 'visible') sync.syncInBackground();
  }, PERIODIC_SYNC_MS);

  return sync.start();
}
