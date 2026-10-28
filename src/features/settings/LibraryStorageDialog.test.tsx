import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/components/Toast';
import { useSyncStore } from '@/features/sync/syncStore';
import { downloadTextFile } from '@/lib/download';
import { getStorageStatus, requestPersistentStorage } from '@/lib/storage/persistence';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { putDocument, putNote } from '@/lib/storage/repository';
import { buildBackup } from '@/lib/sync/backup';
import { getDevice, resetDeviceForTests } from '@/lib/sync/device';
import type { LibraryDocument, MarginNote } from '@/lib/types';
import { LibraryStorageDialog } from './LibraryStorageDialog';
import {
  closeLibraryStorageDialog,
  openLibraryStorageDialog,
  useStorageDialogStore,
} from './storageDialogStore';
import { useStorageStatus } from './storageStatus';

vi.mock('@/lib/download', () => ({ downloadTextFile: vi.fn() }));
vi.mock('@/lib/storage/persistence', () => ({
  getStorageStatus: vi.fn(),
  requestPersistentStorage: vi.fn(),
}));

const BOOK = 'a'.repeat(64);
const MB = 1024 * 1024;

const doc = (id: string, title: string): LibraryDocument => ({
  id,
  title,
  fileName: `${title}.pdf`,
  fileSize: 1,
  pageCount: 10,
  addedAt: 0,
  lastOpenedAt: 0,
});

const note = (id: string, docId: string): MarginNote => ({
  id,
  docId,
  page: 1,
  y: 0.2,
  text: id,
  color: 'amber',
  createdAt: 0,
  updatedAt: 1,
});

const folder = { name: 'Textbooks', linkedAt: 0 };

function setSync(state: Partial<ReturnType<typeof useSyncStore.getState>>) {
  act(() => useSyncStore.setState(state));
}

async function wipeDatabase(): Promise<void> {
  await resetDBForTests();
  resetDeviceForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

async function openDialog(): Promise<HTMLElement> {
  render(<LibraryStorageDialog />);
  act(() => openLibraryStorageDialog());
  const dialog = await screen.findByRole('dialog', { name: 'Library & storage' });
  await waitFor(() => expect(within(dialog).queryByText('Checking storage…')).toBeNull());
  return dialog;
}

beforeEach(async () => {
  await wipeDatabase();
  vi.mocked(getStorageStatus).mockResolvedValue({ persisted: true, usage: 412 * MB, quota: 1000 * MB });
  vi.mocked(requestPersistentStorage).mockResolvedValue(true);
  useStorageStatus.setState({ status: null });
  useToastStore.setState({ toasts: [] });
  useSyncStore.setState({
    status: 'unlinked',
    folder: null,
    lastSyncedAt: null,
    error: null,
    progress: null,
    devices: [],
    linkFolder: vi.fn(async () => {}),
    reconnect: vi.fn(async () => {}),
    unlinkFolder: vi.fn(async () => {}),
    syncNow: vi.fn(async () => {}),
  });
});

afterEach(async () => {
  cleanup();
  useStorageDialogStore.setState({ open: false });
  vi.clearAllMocks();
  await resetDBForTests();
});

describe('Library & storage dialog', () => {
  it('opens as a modal, and closing it returns focus to its opener', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    render(<LibraryStorageDialog />);
    act(() => openLibraryStorageDialog());
    const dialog = (await screen.findByRole('dialog', { name: 'Library & storage' })) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close library and storage' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('can be opened and closed repeatedly', async () => {
    render(<LibraryStorageDialog />);
    for (let round = 0; round < 2; round++) {
      act(() => openLibraryStorageDialog());
      const dialog = await screen.findByRole('dialog', { name: 'Library & storage' });
      expect((dialog as HTMLDialogElement).open).toBe(true);
      act(() => closeLibraryStorageDialog());
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });

  it('explains the folder in one sentence in every state', async () => {
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(
        /Keep your PDFs in a folder — on this computer, OneDrive, Dropbox or Google Drive/,
      ),
    ).toBeTruthy();
  });
});

describe('Library folder', () => {
  it('explains that this browser cannot link folders', async () => {
    setSync({ status: 'unsupported' });
    const dialog = await openDialog();
    expect(within(dialog).getByText('Folder sync needs Chrome or Edge on a computer.')).toBeTruthy();
    expect(within(dialog).getByText('Use backups below to move your notes.')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /link a folder/i })).toBeNull();
  });

  it('offers to link a folder, with a Google Drive tip, and protects storage once linked', async () => {
    const linkFolder = vi.fn(async () => {
      useSyncStore.setState({ status: 'syncing', folder });
    });
    setSync({ linkFolder });
    const dialog = await openDialog();
    expect(within(dialog).getByText(/Install Google Drive for desktop/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Link a folder…' }));
    await waitFor(() => expect(requestPersistentStorage).toHaveBeenCalled());
    expect(linkFolder).toHaveBeenCalledTimes(1);
    expect(await within(dialog).findByText('Syncing with “Textbooks”')).toBeTruthy();
  });

  it('stays quiet when the folder picker is dismissed', async () => {
    const linkFolder = vi.fn(async () => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    });
    setSync({ linkFolder });
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Link a folder…' }));
    await waitFor(() => expect(linkFolder).toHaveBeenCalled());
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Link a folder…' })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(requestPersistentStorage).not.toHaveBeenCalled();
  });

  it('shows why an action failed', async () => {
    setSync({
      linkFolder: vi.fn(async () => {
        throw new Error('Folder sync has not started yet.');
      }),
    });
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Link a folder…' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Folder sync has not started yet.');
  });

  it('asks for permission again after a restart', async () => {
    const reconnect = vi.fn(async () => {});
    setSync({ status: 'needs-permission', folder, reconnect });
    const dialog = await openDialog();
    expect(
      within(dialog).getByText('Scriptorium needs your permission to open “Textbooks” again.'),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(reconnect).toHaveBeenCalledTimes(1));
  });

  it('shows progress while syncing', async () => {
    setSync({ status: 'syncing', folder, progress: { label: 'Adding books', done: 3, total: 12 } });
    const dialog = await openDialog();
    expect(within(dialog).getByText('Adding books')).toBeTruthy();
    expect(within(dialog).getByText('3 of 12')).toBeTruthy();
    const bar = within(dialog).getByRole('progressbar', { name: 'Sync progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemax')).toBe('12');
  });

  it('shows when it last synced and which other devices use the folder', async () => {
    const now = Date.now();
    setSync({
      status: 'idle',
      folder,
      lastSyncedAt: now - 2 * 60_000,
      devices: [{ id: 'd1', name: 'Chrome on macOS', lastWriteAt: now - 26 * 3600_000 }],
    });
    const dialog = await openDialog();
    expect(within(dialog).getByText('Synced with “Textbooks”')).toBeTruthy();
    expect(within(dialog).getByText('Last synced 2 minutes ago')).toBeTruthy();
    expect(within(dialog).getByText('Also used by')).toBeTruthy();
    expect(within(dialog).getByText('Chrome on macOS · yesterday')).toBeTruthy();
  });

  it('syncs now, and changes folder through the picker', async () => {
    const syncNow = vi.fn(async () => {});
    const linkFolder = vi.fn(async () => {});
    setSync({ status: 'idle', folder, lastSyncedAt: Date.now(), syncNow, linkFolder });
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change folder…' }));
    await waitFor(() => expect(linkFolder).toHaveBeenCalledTimes(1));
  });

  it('confirms before unlinking, and says what happens to books and notes', async () => {
    const unlinkFolder = vi.fn(async () => {
      useSyncStore.setState({ status: 'unlinked', folder: null });
    });
    setSync({ status: 'idle', folder, lastSyncedAt: Date.now(), unlinkFolder });
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    const confirm = screen.getByRole('dialog', { name: 'Unlink “Textbooks”?' });
    expect(
      within(confirm).getByText(
        'Books from this folder leave your library on this device. Your notes stay in the folder and come back when you link it again.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(unlinkFolder).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Unlink “Textbooks”?' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Unlink “Textbooks”?' })).getByRole('button', {
        name: 'Unlink',
      }),
    );
    await waitFor(() => expect(unlinkFolder).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByRole('button', { name: 'Link a folder…' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Unlink “Textbooks”?' })).toBeNull();
  });

  it('keeps the dialog open when only the unlink confirmation is dismissed', async () => {
    setSync({ status: 'idle', folder, lastSyncedAt: Date.now() });
    const dialog = (await openDialog()) as HTMLDialogElement;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }));
    const confirm = screen.getByRole('dialog', { name: 'Unlink “Textbooks”?' }) as HTMLDialogElement;
    act(() => confirm.close());
    expect(screen.queryByRole('dialog', { name: 'Unlink “Textbooks”?' })).toBeNull();
    expect(useStorageDialogStore.getState().open).toBe(true);
    expect(dialog.isConnected).toBe(true);
  });

  it('shows the sync error with a way to try again', async () => {
    const syncNow = vi.fn(async () => {});
    setSync({ status: 'error', folder, error: 'Couldn’t read “Textbooks”.', syncNow });
    const dialog = await openDialog();
    expect(within(dialog).getByText('Couldn’t read “Textbooks”.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1));
  });

  it('announces status changes politely', async () => {
    setSync({ status: 'idle', folder, lastSyncedAt: Date.now() });
    const dialog = await openDialog();
    const status = within(dialog).getByText('Synced with “Textbooks”');
    expect(status.getAttribute('role')).toBe('status');
  });
});

describe('This device', () => {
  it('shows the device name and lets the reader rename it', async () => {
    const dialog = await openDialog();
    const input = (await within(dialog).findByLabelText('Device name')) as HTMLInputElement;
    await waitFor(() => expect(input.value).not.toBe(''));
    fireEvent.change(input, { target: { value: '  Kitchen iPad ' } });
    fireEvent.blur(input);
    await waitFor(() => expect(within(dialog).getByText('Saved.')).toBeTruthy());
    expect(input.value).toBe('Kitchen iPad');
    expect((await getDevice()).name).toBe('Kitchen iPad');
  });

  it('falls back to the default name when cleared', async () => {
    const dialog = await openDialog();
    const input = (await within(dialog).findByLabelText('Device name')) as HTMLInputElement;
    await waitFor(() => expect(input.value).not.toBe(''));
    const original = input.value;
    fireEvent.change(input, { target: { value: 'Kitchen iPad' } });
    fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe('Kitchen iPad'));
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe(original));
  });
});

describe('Backups', () => {
  it('exports every book as a dated JSON file and reports what it holds', async () => {
    await putDocument(doc(BOOK, 'Mechanics'));
    await putNote(note('n1', BOOK));
    await putNote(note('n2', BOOK));
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Export backup' }));
    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1));

    const [fileName, text, mimeType] = vi.mocked(downloadTextFile).mock.calls[0];
    expect(fileName).toMatch(/^Scriptorium backup \d{4}-\d{2}-\d{2}\.json$/);
    expect(mimeType).toBe('application/json');
    const backup = JSON.parse(text);
    expect(backup.format).toBe('scriptorium.backup');
    expect(backup.books).toHaveLength(1);
    expect(backup.books[0].data.notes).toHaveLength(2);

    expect(
      await within(dialog).findByText(/^Saved as “Scriptorium backup \d{4}-\d{2}-\d{2}\.json”\.$/),
    ).toBeTruthy();
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Backup saved — 1 book, 2 notes']);
  });

  it('does not write an empty backup file', async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export backup' }));
    expect(await within(dialog).findByText('There’s nothing to back up yet.')).toBeTruthy();
    expect(downloadTextFile).not.toHaveBeenCalled();
  });

  it('restores notes from a backup and lists the PDFs that are still missing', async () => {
    await putDocument(doc(BOOK, 'Mechanics'));
    await putNote(note('n1', BOOK));
    const backup = JSON.stringify(await buildBackup());
    await wipeDatabase();

    const dialog = await openDialog();
    const input = within(dialog).getByLabelText('Choose a backup file');
    fireEvent.change(input, {
      target: { files: [new File([backup], 'backup.json', { type: 'application/json' })] },
    });

    expect(await within(dialog).findByText('Restored notes for 1 book.')).toBeTruthy();
    expect(within(dialog).getByText('Add these PDFs to see their notes:')).toBeTruthy();
    expect(within(dialog).getByText('Mechanics')).toBeTruthy();
  });

  it('says when a backup has nothing new', async () => {
    await putDocument(doc(BOOK, 'Mechanics'));
    await putNote(note('n1', BOOK));
    const backup = JSON.stringify(await buildBackup());
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Choose a backup file'), {
      target: { files: [new File([backup], 'backup.json')] },
    });
    expect(
      await within(dialog).findByText('Nothing new in that backup — your library already has it all.'),
    ).toBeTruthy();
    expect(within(dialog).queryByText('Add these PDFs to see their notes:')).toBeNull();
  });

  it('truncates a long list of missing books', async () => {
    const books = Array.from({ length: 8 }, (_, i) => ({
      book: { id: String(i).repeat(64), title: `Book ${i}`, fileName: `${i}.pdf`, pageCount: 1 },
      data: {
        notes: [{ ...note(`n${i}`, String(i).repeat(64)) }],
        highlights: [],
        bookmarks: [],
        tombstones: [],
      },
    }));
    const backup = JSON.stringify({ format: 'scriptorium.backup', version: 1, exportedAt: 1, books });
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Choose a backup file'), {
      target: { files: [new File([backup], 'backup.json')] },
    });
    expect(await within(dialog).findByText('Restored notes for 8 books.')).toBeTruthy();
    expect(within(dialog).getByText('Book 0')).toBeTruthy();
    expect(within(dialog).getByText('and 3 more')).toBeTruthy();
    expect(within(dialog).queryByText('Book 7')).toBeNull();
  });

  it('reports a file that is not a Scriptorium backup', async () => {
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Choose a backup file'), {
      target: { files: [new File(['{"hello":"world"}'], 'other.json')] },
    });
    expect(await within(dialog).findByText('That file isn’t a Scriptorium backup.')).toBeTruthy();
  });

  it('says what backups hold', async () => {
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(
        'Backups include notes, highlights, bookmarks and reading progress — not the PDFs. Restoring merges; it never deletes newer notes.',
      ),
    ).toBeTruthy();
  });
});

describe('Storage', () => {
  it('shows that the library is protected, and how much space it uses', async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByText('Protected from automatic clean-up')).toBeTruthy();
    expect(within(dialog).getByText('Using 412 MB')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Protect my library' })).toBeNull();
    expect(
      within(dialog).getByText(/Clearing this site’s data in your browser removes books you imported here/),
    ).toBeTruthy();
  });

  it('offers to protect an unprotected library', async () => {
    vi.mocked(getStorageStatus).mockResolvedValue({ persisted: false, usage: 5 * MB });
    const dialog = await openDialog();
    expect(within(dialog).getByText('The browser may clear this data when space runs low')).toBeTruthy();

    vi.mocked(getStorageStatus).mockResolvedValue({ persisted: true, usage: 5 * MB });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Protect my library' }));
    expect(await within(dialog).findByText('Protected from automatic clean-up')).toBeTruthy();
    expect(requestPersistentStorage).toHaveBeenCalledTimes(1);
  });

  it('says so when the browser declines', async () => {
    vi.mocked(getStorageStatus).mockResolvedValue({ persisted: false });
    vi.mocked(requestPersistentStorage).mockResolvedValue(false);
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Protect my library' }));
    expect(await within(dialog).findByText(/Your browser didn’t allow it this time/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Protect my library' })).toBeTruthy();
  });

  it('copes with a browser that does not report protection', async () => {
    vi.mocked(getStorageStatus).mockResolvedValue({ persisted: null });
    const dialog = await openDialog();
    expect(within(dialog).getByText('Stored in this browser')).toBeTruthy();
  });
});
