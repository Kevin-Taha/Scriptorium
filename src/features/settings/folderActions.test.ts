import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncStore } from '@/features/sync/syncStore';
import { requestPersistentStorage } from '@/lib/storage/persistence';
import { linkLibraryFolder, syncLibraryFolderNow } from './folderActions';

vi.mock('@/lib/storage/persistence', () => ({
  getStorageStatus: vi.fn(async () => ({ persisted: false })),
  requestPersistentStorage: vi.fn(async () => true),
}));

const folder = { name: 'Textbooks', linkedAt: 0, provider: 'local' as const };

beforeEach(() => vi.clearAllMocks());
afterEach(() => useSyncStore.setState({ folder: null, status: 'unlinked' }));

describe('folder actions', () => {
  it('returns the message of a failed action, and null on success', async () => {
    useSyncStore.setState({ syncNow: vi.fn(async () => {}) });
    expect(await syncLibraryFolderNow()).toBeNull();
    useSyncStore.setState({
      syncNow: vi.fn(async () => {
        throw new Error('The folder moved.');
      }),
    });
    expect(await syncLibraryFolderNow()).toBe('The folder moved.');
    useSyncStore.setState({
      syncNow: vi.fn(async () => {
        throw 'nope';
      }),
    });
    expect(await syncLibraryFolderNow()).toBe('Something went wrong. Please try again.');
  });

  it('treats a dismissed folder picker as no failure and asks for no protection', async () => {
    useSyncStore.setState({
      folder: null,
      linkFolder: vi.fn(async () => {
        throw new DOMException('Dismissed', 'AbortError');
      }),
    });
    expect(await linkLibraryFolder()).toBeNull();
    expect(requestPersistentStorage).not.toHaveBeenCalled();
  });

  it('asks the browser to keep the library once a folder is linked', async () => {
    useSyncStore.setState({
      folder: null,
      linkFolder: vi.fn(async () => {
        useSyncStore.setState({ folder, status: 'idle' });
      }),
    });
    expect(await linkLibraryFolder()).toBeNull();
    await vi.waitFor(() => expect(requestPersistentStorage).toHaveBeenCalledTimes(1));
  });
});
