import { create } from 'zustand';
import { getStorageStatus, requestPersistentStorage, type StorageStatus } from '@/lib/storage/persistence';
import { listDocuments } from '@/lib/storage/repository';

interface StorageStatusState {
  /** null until the browser has been asked. */
  status: StorageStatus | null;
  refresh(): Promise<void>;
  /** Asks the browser to keep the library; resolves to whether it agreed. */
  protect(): Promise<boolean>;
}

export const useStorageStatus = create<StorageStatusState>()((set, get) => ({
  status: null,

  async refresh() {
    set({ status: await getStorageStatus() });
  },

  async protect() {
    const granted = await requestPersistentStorage();
    await get().refresh();
    return granted;
  },
}));

/**
 * Asks the browser to keep the library once the reader has put something in it
 * (an import, a linked folder). Chromium grants this silently; Firefox shows its
 * own prompt, which is why it is only ever called right after a reader's action.
 */
export function requestPersistenceQuietly(): void {
  void useStorageStatus.getState().protect();
}

/**
 * Asks again at launch for a library that already has books, when the browser will
 * have judged the app engaged enough. Firefox would show a prompt out of the blue,
 * so it only hears from us after an import or a folder link.
 */
export async function requestPersistenceAtStartup(): Promise<void> {
  if (/Firefox\//.test(navigator.userAgent)) return;
  try {
    if ((await listDocuments()).length === 0) return;
  } catch {
    return;
  }
  await useStorageStatus.getState().protect();
}
