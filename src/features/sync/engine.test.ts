import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHash } from '@/lib/hash';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import {
  deleteNote,
  getDocument,
  getReadingState,
  listDocuments,
  listFolderFiles,
  listNotes,
  onLibraryChange,
  putDocument,
  putNote,
  putReadingState,
} from '@/lib/storage/repository';
import type { BookData } from '@/lib/storage/repository';
import { onBookDataMerged } from '@/lib/sync/apply';
import { parseBackup, restoreBackup } from '@/lib/sync/backup';
import { type BookFile, createBookFile, parseBookFile } from '@/lib/sync/bookFile';
import { getDevice, onDeviceRenamed, renameDevice, resetDeviceForTests } from '@/lib/sync/device';
import type { LibraryDocument, MarginNote, ReadingState } from '@/lib/types';
import { type EngineOptions, FolderSyncEngine, type FolderStore, type LinkedFolderRecord } from './engine';
import { useSyncStore } from './syncStore';
import {
  exists,
  getFileHandle,
  MemoryDirectoryHandle,
  movePath,
  readText,
  removePath,
  writeFile,
} from './testing/memoryFs';

vi.mock('@/lib/hash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hash')>();
  return { contentHash: vi.fn(actual.contentHash) };
});

const hashCalls = () => vi.mocked(contentHash).mock.calls.length;

const pdfBytes = (name: string) => new TextEncoder().encode(`%PDF-1.7 ${name}`);
const idOf = async (name: string) => {
  const bytes = pdfBytes(name);
  return contentHash(bytes.buffer.slice(0) as ArrayBuffer);
};

const extractMetadata = vi.fn<EngineOptions['extractMetadata']>(async (bytes) => ({
  title: `Title: ${new TextDecoder().decode(bytes).replace('%PDF-1.7 ', '')}`,
  pageCount: 36,
  coverDataUrl: 'data:image/jpeg;base64,cover',
}));

function memoryFolderStore(initial?: LinkedFolderRecord): FolderStore {
  let record = initial;
  return {
    load: async () => record,
    save: async (folder) => {
      record = folder;
    },
    clear: async () => {
      record = undefined;
    },
  };
}

const cleanups: (() => void)[] = [];

function makeEngine(root: MemoryDirectoryHandle, options: Partial<EngineOptions> = {}) {
  const notify = vi.fn();
  const engine = new FolderSyncEngine({
    extractMetadata,
    notify,
    pickDirectory: async () => root,
    isSupported: () => true,
    folderStore: memoryFolderStore(),
    writeDelayMs: 5,
    ...options,
  });
  cleanups.push(onLibraryChange(({ docId }) => engine.noteLocalChange(docId)));
  // As in folderSync.ts: merged data (e.g. a restored backup) is written to the folder too.
  cleanups.push(onBookDataMerged((docId) => engine.noteLocalChange(docId)));
  return { engine, notify };
}

async function linkedEngine(root: MemoryDirectoryHandle, options: Partial<EngineOptions> = {}) {
  const context = makeEngine(root, options);
  await context.engine.start();
  await context.engine.link();
  await context.engine.whenIdle();
  return context;
}

async function textbooks(...names: string[]): Promise<MemoryDirectoryHandle> {
  const root = new MemoryDirectoryHandle('Textbooks');
  for (const name of names) await writeFile(root, name, pdfBytes(name.split('/').pop()!));
  return root;
}

const note = (id: string, docId: string, updatedAt: number, text = id): MarginNote => ({
  id,
  docId,
  page: 3,
  y: 0.25,
  text,
  color: 'amber',
  createdAt: 1,
  updatedAt,
});

const progress = (docId: string, page: number, updatedAt: number, deviceId: string): ReadingState => ({
  docId,
  location: { page, offset: 0.1 },
  zoom: { mode: 'fit-width', scale: 1 },
  updatedAt,
  deviceId,
});

const emptyData = (): BookData => ({ notes: [], highlights: [], bookmarks: [], tombstones: [] });

const LAPTOP = { id: 'laptop-device', name: 'Edge on Windows' };

async function writeDeviceFile(
  root: MemoryDirectoryHandle,
  docId: string,
  data: Partial<BookData>,
  device = LAPTOP,
  writtenAt = Date.now(),
): Promise<void> {
  const file = createBookFile(
    { id: docId, title: 'Mechanics', fileName: 'Mechanics.pdf', pageCount: 36 },
    device,
    { ...emptyData(), ...data },
    writtenAt,
  );
  await writeFile(root, `.scriptorium/devices/${device.id}/${docId}.json`, JSON.stringify(file));
}

async function ownFile(root: MemoryDirectoryHandle, docId: string): Promise<BookFile | null> {
  const { id } = await getDevice();
  return parseBookFile(JSON.parse(await readText(root, `.scriptorium/devices/${id}/${docId}.json`)));
}

async function ownFileHandle(root: MemoryDirectoryHandle, docId: string) {
  return getFileHandle(root, `.scriptorium/devices/${(await getDevice()).id}/${docId}.json`);
}

async function wipeDatabase(): Promise<void> {
  await resetDBForTests();
  resetDeviceForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await wipeDatabase();
  vi.mocked(contentHash).mockClear();
  extractMetadata.mockClear();
  useSyncStore.setState({
    status: 'unlinked',
    folder: null,
    lastSyncedAt: null,
    error: null,
    progress: null,
    devices: [],
    libraryRevision: 0,
  });
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await resetDBForTests();
});

describe('linking a folder', () => {
  it('adds the folder’s PDFs as folder books and fills in their details', async () => {
    const root = await textbooks(
      'Mechanics.pdf',
      'Physics/Optics.PDF',
      '.hidden/Secret.pdf',
      'node_modules/x.pdf',
    );
    await writeFile(root, 'Physics/notes.txt', 'not a book');
    const progressSeen: unknown[] = [];
    const unsubscribe = useSyncStore.subscribe((state) => {
      if (state.progress) progressSeen.push(state.progress);
    });
    const { notify } = await linkedEngine(root);
    unsubscribe();

    const docs = await listDocuments();
    expect(docs.map((d) => [d.title, d.source]).sort()).toEqual([
      ['Title: Mechanics.pdf', { kind: 'folder', path: 'Mechanics.pdf' }],
      ['Title: Optics.PDF', { kind: 'folder', path: 'Physics/Optics.PDF' }],
    ]);
    expect(docs.every((d) => d.pageCount === 36 && d.coverDataUrl && d.lastOpenedAt === 0)).toBe(true);
    expect(docs.find((d) => d.fileName === 'Mechanics.pdf')?.id).toBe(await idOf('Mechanics.pdf'));
    expect(await readText(root, '.scriptorium/README.txt')).toContain('Scriptorium');
    expect(progressSeen).toContainEqual({ label: 'Adding books', done: 2, total: 2 });

    const state = useSyncStore.getState();
    expect(state.status).toBe('idle');
    expect(state.folder?.name).toBe('Textbooks');
    expect(state.lastSyncedAt).not.toBeNull();
    expect(state.progress).toBeNull();
    expect(state.libraryRevision).toBeGreaterThan(0);
    expect(notify).toHaveBeenCalledWith('Linked “Textbooks”', 'neutral');
  });

  it('does nothing when the picker is cancelled', async () => {
    const { engine, notify } = makeEngine(new MemoryDirectoryHandle('x'), {
      pickDirectory: async () => {
        throw new DOMException('cancelled', 'AbortError');
      },
    });
    await engine.start();
    await engine.link();
    expect(useSyncStore.getState().status).toBe('unlinked');
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports browsers that can’t link folders as soon as it starts', async () => {
    const { engine } = makeEngine(new MemoryDirectoryHandle('x'), { isSupported: () => false });
    const started = engine.start();
    expect(useSyncStore.getState().status).toBe('unsupported');
    await started;
    expect(useSyncStore.getState().status).toBe('unsupported');
  });

  it('writes notes this device already had into the folder', async () => {
    const id = await idOf('Imported.pdf');
    await putDocument({
      id,
      title: 'Imported',
      fileName: 'Imported.pdf',
      fileSize: 1,
      pageCount: 3,
      addedAt: 0,
      lastOpenedAt: 0,
    });
    await putNote(note('n1', id, 10, 'Written before linking'));
    const root = await textbooks();
    await linkedEngine(root);
    const file = await ownFile(root, id);
    expect(file?.book.title).toBe('Imported');
    expect(file?.data.notes.map((n) => n.text)).toEqual(['Written before linking']);
  });

  it('keeps imported books imported when the same PDF is in the folder', async () => {
    const id = await idOf('Mechanics.pdf');
    const imported: LibraryDocument = {
      id,
      title: 'Imported',
      fileName: 'Mechanics.pdf',
      fileSize: 1,
      pageCount: 36,
      addedAt: 0,
      lastOpenedAt: 5,
    };
    await putDocument(imported);
    await linkedEngine(await textbooks('Mechanics.pdf'));
    expect(await listDocuments()).toEqual([imported]);
  });
});

describe('rescanning', () => {
  it('doesn’t rehash unchanged files and follows moved and renamed files', async () => {
    const root = await textbooks('Mechanics.pdf', 'Optics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    const hashed = hashCalls();

    await engine.sync();
    expect(hashCalls()).toBe(hashed);

    await movePath(root, 'Mechanics.pdf', 'Physics/Classical Mechanics.pdf');
    await engine.sync();
    expect(hashCalls()).toBe(hashed);
    expect((await getDocument(id))?.source).toEqual({
      kind: 'folder',
      path: 'Physics/Classical Mechanics.pdf',
    });
    expect((await getDocument(id))?.fileName).toBe('Classical Mechanics.pdf');
    expect((await listFolderFiles()).map((r) => r.path).sort()).toEqual([
      'Optics.pdf',
      'Physics/Classical Mechanics.pdf',
    ]);
  });

  it('treats an edited PDF as a new book and the old one as missing', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const oldId = await idOf('Mechanics.pdf');
    await writeFile(root, 'Mechanics.pdf', pdfBytes('Mechanics, 2nd edition'));
    await engine.sync();
    await engine.whenIdle();
    const docs = await listDocuments();
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.id === oldId)?.source).toEqual({
      kind: 'folder',
      path: 'Mechanics.pdf',
      missing: true,
    });
    expect(docs.find((d) => d.id !== oldId)?.title).toBe('Title: Mechanics, 2nd edition');
  });

  it('marks a removed PDF missing, keeping its notes, until it returns', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    await putNote(note('n1', id, 10));
    await removePath(root, 'Mechanics.pdf');
    await engine.sync();
    expect((await getDocument(id))?.source).toEqual({ kind: 'folder', path: 'Mechanics.pdf', missing: true });
    expect(await listNotes(id)).toHaveLength(1);

    await writeFile(root, 'Books/Mechanics.pdf', pdfBytes('Mechanics.pdf'));
    await engine.sync();
    expect((await getDocument(id))?.source).toEqual({ kind: 'folder', path: 'Books/Mechanics.pdf' });
    expect(await listNotes(id)).toHaveLength(1);
  });

  it('never runs two passes at once', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    let scans = 0;
    const values = root.values.bind(root);
    root.values = () => {
      scans++;
      return values();
    };
    await Promise.all([engine.sync(), engine.sync(), engine.sync(), engine.sync()]);
    expect(scans).toBe(2);
  });
});

describe('this device’s files', () => {
  it('are written after local changes, and only when their content changed', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');

    await putNote(note('n1', id, 10, 'First thought'));
    await engine.flushWrites();
    const file = await ownFile(root, id);
    expect(file?.device).toEqual(await getDevice());
    expect(file?.book).toEqual({
      id,
      title: 'Title: Mechanics.pdf',
      fileName: 'Mechanics.pdf',
      pageCount: 36,
    });
    expect(file?.data.notes.map((n) => n.text)).toEqual(['First thought']);
    const handle = await ownFileHandle(root, id);
    expect(handle.writes).toBe(1);

    await engine.sync();
    engine.noteLocalChange(id);
    await engine.flushWrites();
    expect(handle.writes).toBe(1);

    await deleteNote('n1');
    await engine.flushWrites();
    expect(handle.writes).toBe(2);
    const after = await ownFile(root, id);
    expect(after?.data.notes).toEqual([]);
    expect(after?.data.tombstones.map((t) => t.id)).toEqual(['n1']);
  });

  it('are written shortly after a change without an explicit flush', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    await putReadingState(progress(id, 7, 50, (await getDevice()).id));
    await vi.waitFor(async () =>
      expect(await exists(root, `.scriptorium/devices/${(await getDevice()).id}/${id}.json`)).toBe(true),
    );
    await engine.whenIdle();
    expect((await ownFile(root, id))?.data.progress?.location.page).toBe(7);
  });

  it('include notes restored from a backup while the folder is linked', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    await restoreBackup(
      parseBackup({
        format: 'scriptorium.backup',
        version: 1,
        books: [{ book: { id }, data: { notes: [note('restored', id, 40)] } }],
      }),
    );
    await vi.waitFor(async () =>
      expect((await ownFile(root, id))?.data.notes.map((n) => n.id)).toEqual(['restored']),
    );
    await engine.whenIdle();
  });

  it('are rewritten under the new name when this device is renamed', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    cleanups.push(onDeviceRenamed(() => engine.deviceRenamed()));
    const id = await idOf('Mechanics.pdf');
    await putNote(note('n1', id, 10));
    await engine.flushWrites();
    const handle = await ownFileHandle(root, id);
    expect(handle.writes).toBe(1);

    await renameDevice('Study laptop');
    await engine.whenIdle();
    expect(handle.writes).toBe(2);
    expect((await ownFile(root, id))?.device.name).toBe('Study laptop');
    await engine.sync();
    expect(handle.writes).toBe(2);
  });

  it('are written again if they vanish from the folder', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    await putNote(note('n1', id, 10));
    await engine.flushWrites();
    await removePath(root, '.scriptorium');
    await engine.sync();
    expect((await ownFile(root, id))?.data.notes).toHaveLength(1);
    expect(await exists(root, '.scriptorium/README.txt')).toBe(true);
  });
});

describe('other devices’ files', () => {
  it('merge notes, deletions and reading position, then flow back into this device’s file', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    await putNote(note('keep', id, 10));
    await putNote(note('doomed', id, 10));
    const merged = vi.fn((_docId: string) => useSyncStore.getState().devices.map((d) => d.name));
    cleanups.push(onBookDataMerged(merged));

    const remoteProgress = progress(id, 12, 5_000, LAPTOP.id);
    await writeDeviceFile(
      root,
      id,
      {
        notes: [note('remote', id, 20, 'From the laptop')],
        tombstones: [{ id: 'doomed', kind: 'note', docId: id, deletedAt: 30 }],
        progress: remoteProgress,
      },
      LAPTOP,
      6_000,
    );
    await engine.sync();

    expect((await listNotes(id)).map((n) => n.id).sort()).toEqual(['keep', 'remote']);
    expect(await getReadingState(id)).toEqual(remoteProgress);
    expect(merged).toHaveBeenCalledTimes(1);
    expect(merged.mock.calls[0][0]).toBe(id);
    // Listeners can already name the device the data came from.
    expect(merged.mock.results[0].value).toEqual([LAPTOP.name]);
    expect((await getDocument(id))?.lastOpenedAt).toBe(5_000);

    const own = await ownFile(root, id);
    expect(own?.data.notes.map((n) => n.id)).toEqual(['keep', 'remote']);
    expect(own?.data.tombstones.map((t) => t.id)).toEqual(['doomed']);
    expect(own?.data.progress).toEqual(remoteProgress);
    expect(useSyncStore.getState().devices).toEqual([
      { id: LAPTOP.id, name: LAPTOP.name, lastWriteAt: 6_000 },
    ]);
  });

  it('revive a note here when it was edited there after being deleted here', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    await putNote(note('n1', id, 10));
    await deleteNote('n1');
    await writeDeviceFile(root, id, { notes: [note('n1', id, Date.now() + 60_000, 'Edited later')] });
    await engine.sync();
    expect((await listNotes(id)).map((n) => n.text)).toEqual(['Edited later']);
    expect((await ownFile(root, id))?.data.tombstones).toEqual([]);
  });

  it('are only read again once they change', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    await writeDeviceFile(root, id, { notes: [note('a', id, 10, 'one')] });
    await engine.sync();
    const merged = vi.fn();
    cleanups.push(onBookDataMerged(merged));

    // Same size and time: a pass must not even open the file.
    const handle = await getFileHandle(root, `.scriptorium/devices/${LAPTOP.id}/${id}.json`);
    const before = await handle.getFile();
    const sameSize = (await before.text()).replace('"one"', '"two"');
    handle.replace(new TextEncoder().encode(sameSize), before.lastModified);
    await engine.sync();
    expect(merged).not.toHaveBeenCalled();

    handle.replace(new TextEncoder().encode(sameSize));
    await engine.sync();
    expect(merged).toHaveBeenCalledTimes(1);
    expect((await listNotes(id)).map((n) => n.text)).toEqual(['two']);
  });

  it('ignore malformed, unknown and half-synced files until they become valid', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    const other = 'f'.repeat(64);
    const valid = JSON.stringify(
      createBookFile({ id, title: 'M', fileName: 'M.pdf', pageCount: 1 }, LAPTOP, {
        ...emptyData(),
        notes: [note('late', id, 10, 'Arrived late')],
      }),
    );
    const dir = `.scriptorium/devices/${LAPTOP.id}`;
    await writeFile(root, `${dir}/${id}.json`, valid.slice(0, valid.length / 2));
    await writeFile(root, `${dir}/${other}.json`, JSON.stringify({ format: 'something.else', version: 1 }));
    await writeFile(
      root,
      `.scriptorium/devices/tablet/${other}.json`,
      JSON.stringify({ ...JSON.parse(valid), version: 99 }),
    );
    await writeFile(root, `.scriptorium/devices/phone/${other}.json`, valid);
    await writeFile(root, `${dir}/notes.json`, 'nonsense');

    await engine.sync();
    expect(useSyncStore.getState().status).toBe('idle');
    expect(await listNotes(id)).toEqual([]);
    expect(await listNotes(other)).toEqual([]);
    expect(useSyncStore.getState().devices).toEqual([]);

    await writeFile(root, `${dir}/${id}.json`, valid);
    await engine.sync();
    expect((await listNotes(id)).map((n) => n.text)).toEqual(['Arrived late']);
  });

  it('merge notes for books whose PDF isn’t in the folder', async () => {
    const root = await textbooks();
    const { engine } = await linkedEngine(root);
    const id = await idOf('Elsewhere.pdf');
    await writeDeviceFile(root, id, { notes: [note('n', id, 10, 'Waiting for its PDF')] });
    await engine.sync();
    expect((await listNotes(id)).map((n) => n.text)).toEqual(['Waiting for its PDF']);
    expect(await listDocuments()).toEqual([]);
    expect((await ownFile(root, id))?.book.title).toBe('Mechanics');

    await writeFile(root, 'Elsewhere.pdf', pdfBytes('Elsewhere.pdf'));
    await engine.sync();
    await engine.whenIdle();
    expect((await getDocument(id))?.source).toEqual({ kind: 'folder', path: 'Elsewhere.pdf' });
  });
});

describe('restoring and unlinking', () => {
  it('restores books, notes and position from the folder after browser data is cleared', async () => {
    const root = await textbooks('Mechanics.pdf');
    const first = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    const oldDevice = await getDevice();
    await putNote(note('n1', id, 10, 'Survives clearing'));
    await putReadingState(progress(id, 21, 7_000, oldDevice.id));
    await first.engine.flushWrites();
    for (const cleanup of cleanups.splice(0)) cleanup();

    await wipeDatabase();
    const { notify } = await linkedEngine(root);
    expect((await getDevice()).id).not.toBe(oldDevice.id);
    expect(notify).toHaveBeenCalledWith('Linked “Textbooks”. Found notes from 1 other device.', 'neutral');
    expect((await listNotes(id)).map((n) => n.text)).toEqual(['Survives clearing']);
    expect((await getReadingState(id))?.location.page).toBe(21);
    const doc = await getDocument(id);
    expect(doc?.source).toEqual({ kind: 'folder', path: 'Mechanics.pdf' });
    expect(doc?.lastOpenedAt).toBe(7_000);
  });

  it('unlinking removes folder books but keeps their notes; linking again restores them', async () => {
    const root = await textbooks('Mechanics.pdf');
    const importedId = await idOf('Imported.pdf');
    await putDocument({
      id: importedId,
      title: 'Imported',
      fileName: 'Imported.pdf',
      fileSize: 1,
      pageCount: 3,
      addedAt: 0,
      lastOpenedAt: 0,
    });
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    await putNote(note('n1', id, 10));

    await engine.unlink();
    expect((await listDocuments()).map((d) => d.id)).toEqual([importedId]);
    expect(await listNotes(id)).toHaveLength(1);
    expect(await listFolderFiles()).toEqual([]);
    expect(useSyncStore.getState()).toMatchObject({ status: 'unlinked', folder: null, devices: [] });

    await engine.link();
    await engine.whenIdle();
    expect((await getDocument(id))?.source).toEqual({ kind: 'folder', path: 'Mechanics.pdf' });
    expect(await listNotes(id)).toHaveLength(1);
  });

  it('unlinking keeps a folder book that also has a copy stored here, as imported', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const id = await idOf('Mechanics.pdf');
    // As importing the same PDF does: a stored copy alongside the folder entry.
    await putDocument((await getDocument(id))!, new Blob([pdfBytes('Mechanics.pdf')]));

    await engine.unlink();
    expect((await getDocument(id))?.source).toEqual({ kind: 'imported' });
  });

  it('never replaces a book imported while the folder was being scanned', async () => {
    const root = await textbooks('Mechanics.pdf');
    const id = await idOf('Mechanics.pdf');
    const imported: LibraryDocument = {
      id,
      title: 'Mechanics (imported)',
      fileName: 'Mechanics.pdf',
      fileSize: 1,
      pageCount: 3,
      addedAt: 0,
      lastOpenedAt: 5,
      source: { kind: 'imported' },
    };
    // The import lands while the pass is hashing files, after it listed the library.
    vi.mocked(contentHash).mockImplementationOnce(async (bytes) => {
      await putDocument(imported);
      const actual = await vi.importActual<typeof import('@/lib/hash')>('@/lib/hash');
      return actual.contentHash(bytes);
    });
    await linkedEngine(root);
    expect(await getDocument(id)).toMatchObject({
      title: 'Mechanics (imported)',
      source: { kind: 'imported' },
    });
  });
});

describe('permission', () => {
  it('resumes straight away when access is still granted', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = makeEngine(root, {
      folderStore: memoryFolderStore({ handle: root, name: root.name, linkedAt: 1 }),
    });
    await engine.start();
    await engine.whenIdle();
    expect(useSyncStore.getState()).toMatchObject({
      status: 'idle',
      folder: { name: 'Textbooks', linkedAt: 1 },
    });
    expect(await listDocuments()).toHaveLength(1);
  });

  it('waits for the reader to reconnect after a restart', async () => {
    const root = await textbooks('Mechanics.pdf');
    root.permission = 'prompt';
    root.grantOnRequest = 'denied';
    const { engine, notify } = makeEngine(root, {
      folderStore: memoryFolderStore({ handle: root, name: root.name, linkedAt: 1 }),
    });
    await engine.start();
    expect(useSyncStore.getState().status).toBe('needs-permission');
    expect(await engine.root()).toEqual({ status: 'needs-permission', folderName: 'Textbooks' });

    await engine.reconnect();
    expect(useSyncStore.getState().status).toBe('needs-permission');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('still can’t open “Textbooks”'), 'error');

    root.grantOnRequest = 'granted';
    await engine.reconnect();
    await engine.whenIdle();
    expect(useSyncStore.getState().status).toBe('idle');
    expect(await listDocuments()).toHaveLength(1);
  });

  it('notices when access is withdrawn during a session', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    root.permission = 'prompt';
    await engine.sync();
    expect(useSyncStore.getState().status).toBe('needs-permission');
  });
});

describe('failures', () => {
  it('are reported in the store without throwing, and clear on the next good pass', async () => {
    const root = await textbooks('Mechanics.pdf');
    const { engine } = await linkedEngine(root);
    const getDirectoryHandle = root.getDirectoryHandle.bind(root);
    root.getDirectoryHandle = async () => {
      throw new DOMException('gone', 'NotFoundError');
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(engine.sync()).resolves.toBeUndefined();
    expect(useSyncStore.getState().status).toBe('error');
    expect(useSyncStore.getState().error).toContain('Couldn’t find “Textbooks”');

    root.getDirectoryHandle = getDirectoryHandle;
    await engine.sync();
    expect(useSyncStore.getState()).toMatchObject({ status: 'idle', error: null });
    vi.mocked(console.error).mockRestore();
  });

  it('skip PDFs that can’t be read and keep the rest', async () => {
    const root = await textbooks('Mechanics.pdf', 'Locked.pdf');
    const locked = await getFileHandle(root, 'Locked.pdf');
    const getFile = locked.getFile.bind(locked);
    let calls = 0;
    // The first read (the scan) succeeds; reading the contents to hash them fails.
    locked.getFile = async () => {
      if (++calls > 1) throw new DOMException('busy', 'NotReadableError');
      return getFile();
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await linkedEngine(root);
    expect((await listDocuments()).map((d) => d.fileName)).toEqual(['Mechanics.pdf']);
    expect(useSyncStore.getState().status).toBe('idle');
    vi.mocked(console.warn).mockRestore();
  });
});
