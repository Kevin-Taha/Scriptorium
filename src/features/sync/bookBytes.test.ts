import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHash } from '@/lib/hash';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { getDocument, getDocumentFile } from '@/lib/storage/repository';
import { resetDeviceForTests } from '@/lib/sync/device';
import type { LibraryDocument } from '@/lib/types';
import { readBookBytes } from './bookBytes';
import { FolderSyncEngine, type LinkedFolderRecord } from './engine';
import { provideFolderAccess } from './folderAccess';
import { MemoryDirectoryHandle, movePath, removePath, writeFile } from './testing/memoryFs';

// The test IndexedDB can't store Blobs, so imported books' stored copies are stubbed.
vi.mock('@/lib/storage/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/repository')>()),
  getDocumentFile: vi.fn(),
}));

const bytesOf = (text: string) => new TextEncoder().encode(text);
const textOf = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

async function linkFolder(root: MemoryDirectoryHandle): Promise<FolderSyncEngine> {
  let stored: LinkedFolderRecord | undefined;
  const engine = new FolderSyncEngine({
    extractMetadata: async () => ({ title: 'Mechanics', pageCount: 1, coverDataUrl: 'data:' }),
    pickDirectory: async () => root,
    isSupported: () => true,
    folderStore: {
      load: async () => stored,
      save: async (folder) => {
        stored = folder;
      },
      clear: async () => {
        stored = undefined;
      },
    },
  });
  await engine.start();
  await engine.link();
  await engine.whenIdle();
  provideFolderAccess(engine);
  return engine;
}

async function folderBook(): Promise<{ root: MemoryDirectoryHandle; doc: LibraryDocument }> {
  const root = new MemoryDirectoryHandle('Textbooks');
  await writeFile(root, 'Mechanics.pdf', bytesOf('%PDF mechanics'));
  await linkFolder(root);
  const id = await contentHash(bytesOf('%PDF mechanics').buffer as ArrayBuffer);
  return { root, doc: (await getDocument(id))! };
}

beforeEach(async () => {
  await resetDBForTests();
  resetDeviceForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

afterEach(async () => {
  provideFolderAccess(null);
  await resetDBForTests();
});

describe('readBookBytes', () => {
  it('reads imported books from browser storage', async () => {
    const doc: LibraryDocument = {
      id: 'a'.repeat(64),
      title: 'Imported',
      fileName: 'Imported.pdf',
      fileSize: 4,
      pageCount: 1,
      addedAt: 0,
      lastOpenedAt: 0,
    };
    vi.mocked(getDocumentFile).mockResolvedValueOnce(new Blob([bytesOf('%PDF')]));
    expect(textOf(await readBookBytes(doc))).toBe('%PDF');
    vi.mocked(getDocumentFile).mockResolvedValueOnce(undefined);
    await expect(readBookBytes(doc)).rejects.toThrow('This book is no longer in your library.');
    vi.mocked(getDocumentFile).mockResolvedValueOnce({
      arrayBuffer: () => Promise.reject(new DOMException('gone', 'NotReadableError')),
    } as Blob);
    await expect(readBookBytes(doc)).rejects.toThrow(/saved copy couldn’t be read/);
  });

  it('reads folder books straight from the folder', async () => {
    const { doc } = await folderBook();
    expect(doc.source).toEqual({ kind: 'folder', path: 'Mechanics.pdf' });
    expect(textOf(await readBookBytes(doc))).toBe('%PDF mechanics');
  });

  it('finds a book whose file moved since the last scan', async () => {
    const { root, doc } = await folderBook();
    await movePath(root, 'Mechanics.pdf', 'Physics/Mechanics.pdf');
    expect(textOf(await readBookBytes(doc))).toBe('%PDF mechanics');
    expect((await getDocument(doc.id))?.source).toEqual({ kind: 'folder', path: 'Physics/Mechanics.pdf' });
  });

  it('never opens a different PDF saved over the book’s file', async () => {
    const { root, doc } = await folderBook();
    await writeFile(root, 'Mechanics.pdf', bytesOf('%PDF mechanics, second edition'));
    await expect(readBookBytes(doc)).rejects.toThrow('Couldn’t find “Mechanics.pdf” in your library folder.');
  });

  it('explains a missing file without losing anything', async () => {
    const { root, doc } = await folderBook();
    await removePath(root, 'Mechanics.pdf');
    await expect(readBookBytes(doc)).rejects.toThrow(/put it back — your notes and progress are kept/);
    expect((await getDocument(doc.id))?.source).toMatchObject({ missing: true });
  });

  it('asks the reader to reconnect when access lapsed', async () => {
    const { doc } = await folderBook();
    provideFolderAccess({
      root: async () => ({ status: 'needs-permission', folderName: 'Textbooks', provider: 'local' }),
      rescan: async () => undefined,
      keptBook: async () => null,
    });
    await expect(readBookBytes(doc)).rejects.toThrow(/permission to open “Textbooks” again.*Reconnect/);
  });

  it('asks the reader to link the folder again once it is unlinked', async () => {
    const { doc } = await folderBook();
    provideFolderAccess(null);
    await expect(readBookBytes(doc)).rejects.toThrow(/isn’t linked any more/);
  });
});
