import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/components/Toast';
import { useStorageDialogStore } from '@/features/settings/storageDialogStore';
import { useSyncStore } from '@/features/sync/syncStore';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { requestPersistentStorage } from '@/lib/storage/persistence';
import { putDocument, putReadingState } from '@/lib/storage/repository';
import type { LibraryDocument } from '@/lib/types';
import { importPdfFile } from './importPdf';
import { LibraryView } from './LibraryView';

vi.mock('./importPdf', () => ({ importPdfFile: vi.fn() }));
vi.mock('@/lib/storage/persistence', () => ({
  getStorageStatus: vi.fn(async () => ({ persisted: true })),
  requestPersistentStorage: vi.fn(async () => true),
}));

const folder = { name: 'Textbooks', linkedAt: 0 };
const hour = 3600_000;

const doc = (n: number, overrides: Partial<LibraryDocument> = {}): LibraryDocument => ({
  id: String(n).repeat(64),
  title: `Book ${n}`,
  fileName: `book-${n}.pdf`,
  fileSize: 1,
  pageCount: 100,
  addedAt: 0,
  lastOpenedAt: Date.now() - n * hour,
  ...overrides,
});

async function wipeDatabase(): Promise<void> {
  await resetDBForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

function setSync(state: Partial<ReturnType<typeof useSyncStore.getState>>) {
  act(() => useSyncStore.setState(state));
}

beforeEach(async () => {
  await wipeDatabase();
  window.location.hash = '#/';
  useToastStore.setState({ toasts: [] });
  useStorageDialogStore.setState({ open: false });
  useSyncStore.setState({
    status: 'unlinked',
    folder: null,
    lastSyncedAt: null,
    error: null,
    progress: null,
    devices: [],
    libraryRevision: 0,
    linkFolder: vi.fn(async () => {}),
    reconnect: vi.fn(async () => {}),
  });
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await resetDBForTests();
});

describe('empty library', () => {
  it('offers to link a folder next to Open PDF', async () => {
    const linkFolder = vi.fn(async () => {});
    setSync({ linkFolder });
    render(<LibraryView />);
    await screen.findByRole('heading', { name: 'Begin your library' });
    expect(screen.getByText('Works with OneDrive and Google Drive folders too.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Link a folder…' }));
    await waitFor(() => expect(linkFolder).toHaveBeenCalledTimes(1));
  });

  it('shows the reason when linking fails', async () => {
    setSync({
      linkFolder: vi.fn(async () => {
        throw new Error('Folder sync has not started yet.');
      }),
    });
    render(<LibraryView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link a folder…' }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
        'Folder sync has not started yet.',
      ]),
    );
  });

  it('hides the folder action where folders cannot be linked', async () => {
    setSync({ status: 'unsupported' });
    render(<LibraryView />);
    await screen.findByRole('heading', { name: 'Begin your library' });
    expect(screen.queryByRole('button', { name: 'Link a folder…' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Open PDF' })).toHaveLength(2);
  });

  it('leaves the empty state alone once a folder is linked, and shows its chip instead', async () => {
    setSync({ status: 'syncing', folder, progress: { label: 'Adding books', done: 3, total: 12 } });
    render(<LibraryView />);
    await screen.findByRole('heading', { name: 'Begin your library' });
    expect(screen.queryByRole('button', { name: 'Link a folder…' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Adding books 3 / 12' })).toBeTruthy();
  });
});

describe('Library & storage', () => {
  it('opens from the top line', async () => {
    render(<LibraryView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Library and storage' }));
    expect(useStorageDialogStore.getState().open).toBe(true);
  });
});

describe('books from a linked folder', () => {
  beforeEach(async () => {
    await putDocument(doc(1, { source: { kind: 'folder', path: 'Physics/book-1.pdf', missing: true } }));
    await putDocument(doc(2, { lastOpenedAt: 0, source: { kind: 'folder', path: 'book-2.pdf' } }));
    await putDocument(doc(3));
    setSync({ status: 'idle', folder, lastSyncedAt: Date.now() });
  });

  it('continues with the newest book that is actually readable', async () => {
    render(<LibraryView />);
    const continueSection = await screen.findByRole('region', { name: 'Pick up where you left off' });
    expect(within(continueSection).getByRole('heading', { name: 'Book 3' })).toBeTruthy();
  });

  it('shows a folder chip, dims the missing book, and explains instead of opening it', async () => {
    render(<LibraryView />);
    expect(await screen.findByText('File missing from folder')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Textbooks · synced/ })).toBeTruthy();
    expect(screen.getByText('Not opened yet')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Open Book 1,/ }));
    expect(window.location.hash).toBe('#/');
    expect(useToastStore.getState().toasts[0].message).toContain('“Book 1” isn’t in your library folder');

    fireEvent.click(screen.getByRole('button', { name: /^Open Book 2,/ }));
    expect(window.location.hash).toContain('#/read/');
  });

  it('does not offer a never-opened folder book as the book to continue', async () => {
    await wipeDatabase();
    await putDocument(doc(2, { lastOpenedAt: 0, source: { kind: 'folder', path: 'book-2.pdf' } }));
    render(<LibraryView />);
    await screen.findByRole('heading', { name: 'Your books' });
    expect(screen.queryByRole('region', { name: 'Pick up where you left off' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Open Book 2,/ })).toBeTruthy();
  });

  it('refreshes when the sync engine changes the library', async () => {
    render(<LibraryView />);
    await screen.findByRole('heading', { name: 'Your books' });
    expect(screen.queryByText('Book 4')).toBeNull();
    await putDocument(doc(4, { source: { kind: 'folder', path: 'book-4.pdf' } }));
    setSync({ libraryRevision: 1 });
    expect(await screen.findByRole('button', { name: /^Open Book 4,/ })).toBeTruthy();
  });
});

describe('pick up where you left off', () => {
  it('names the chapter and section you were in, and continues there', async () => {
    const book = doc(1, {
      contents: [
        { title: 'Chapter 1: Kinematics', page: 3, depth: 0 },
        { title: 'Chapter 2: Newton’s Laws', page: 11, depth: 0 },
        { title: '2.2 The Second Law', page: 14, depth: 1 },
      ],
    });
    await putDocument(book);
    await putReadingState({
      docId: book.id,
      location: { page: 14, offset: 0 },
      zoom: { mode: 'fit-width', scale: 1 },
      updatedAt: 1,
    });
    render(<LibraryView />);
    const section = await screen.findByRole('region', { name: 'Pick up where you left off' });
    expect(within(section).getByRole('heading', { name: 'Book 1' })).toBeTruthy();
    expect(within(section).getByText(/^Chapter 2: Newton’s Laws/)).toBeTruthy();
    expect(within(section).getByText('2.2 The Second Law')).toBeTruthy();
    expect(within(section).getByText('Page 14 of 100')).toBeTruthy();

    fireEvent.click(within(section).getByRole('button', { name: 'Continue reading' }));
    expect(window.location.hash).toBe(`#/read/${book.id}`);
  });

  it('shows the page alone for a book that has not been opened since contents were saved', async () => {
    await putDocument(doc(1));
    render(<LibraryView />);
    const section = await screen.findByRole('region', { name: 'Pick up where you left off' });
    expect(within(section).getByText('Page 1 of 100')).toBeTruthy();
    expect(within(section).queryByText(/Chapter/)).toBeNull();
  });
});

describe('importing', () => {
  it('asks the browser to keep the library once a book is added', async () => {
    const added = doc(5);
    await putDocument(added);
    vi.mocked(importPdfFile).mockResolvedValue({ doc: added, isNew: true });
    render(<LibraryView />);
    const input = (await screen.findByLabelText('Choose PDFs to import')) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'book-5.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => expect(requestPersistentStorage).toHaveBeenCalledTimes(1));
  });
});
