import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHash } from '@/lib/hash';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { getDocument, listDocuments, listNotes, onLibraryChange, putNote } from '@/lib/storage/repository';
import { createBookFile } from '@/lib/sync/bookFile';
import { getDevice, resetDeviceForTests } from '@/lib/sync/device';
import type { MarginNote } from '@/lib/types';
import { readBookBytes } from './bookBytes';
import { DriveDirectoryHandle } from './drive/driveFs';
import { setDriveSession } from './drive/session';
import { FakeDrive } from './drive/testing/fakeDrive';
import { type FakeSession, fakeSession } from './drive/testing/fakeSession';
import {
  type EngineOptions,
  FolderSyncEngine,
  type FolderStore,
  type LinkedFolderRecord,
  metaFolderStore,
} from './engine';
import { provideFolderAccess } from './folderAccess';
import { useSyncStore } from './syncStore';

const PDF = '%PDF-1.7 Mechanics';
const LAPTOP = { id: 'laptop-device', name: 'Edge on Windows' };

const memoryStore = (): FolderStore => {
  let record: LinkedFolderRecord | undefined;
  return {
    load: async () => record,
    save: async (folder) => {
      record = folder;
    },
    clear: async () => {
      record = undefined;
    },
  };
};

const note = (id: string, docId: string, text: string): MarginNote => ({
  id,
  docId,
  page: 2,
  y: 0.4,
  text,
  color: 'sage',
  createdAt: 1,
  updatedAt: Date.now(),
});

const cleanups: (() => void)[] = [];
let drive: FakeDrive;
let session: FakeSession;
let bookId: string;

function engineFor(options: Partial<EngineOptions> = {}) {
  const notify = vi.fn();
  const engine = new FolderSyncEngine({
    extractMetadata: async () => ({
      title: 'Mechanics',
      pageCount: 36,
      coverDataUrl: 'data:image/jpeg;base64,x',
    }),
    notify,
    isSupported: () => false,
    isDriveAvailable: () => true,
    pickDriveFolder: async () =>
      new DriveDirectoryHandle(session, drive.find('Textbooks')!.id, 'Textbooks', 'reader@example.com'),
    folderStore: memoryStore(),
    writeDelayMs: 5,
    ...options,
  });
  cleanups.push(onLibraryChange(({ docId }) => engine.noteLocalChange(docId)));
  return { engine, notify };
}

async function linked(options: Partial<EngineOptions> = {}) {
  const context = engineFor(options);
  await context.engine.start();
  await context.engine.link('google-drive');
  await context.engine.whenIdle();
  return context;
}

beforeEach(async () => {
  await resetDBForTests();
  resetDeviceForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  drive = new FakeDrive();
  drive.write('Textbooks/Physics/Mechanics.pdf', PDF);
  session = fakeSession(drive);
  setDriveSession(session);
  bookId = await contentHash(new TextEncoder().encode(PDF).buffer as ArrayBuffer);
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
  provideFolderAccess(null);
  setDriveSession(null);
  await resetDBForTests();
});

describe('a Google Drive library folder', () => {
  it('works where local folders can’t: its PDFs join the library and notes are saved beside them', async () => {
    const { engine, notify } = await linked();
    const state = useSyncStore.getState();
    expect(state).toMatchObject({ status: 'idle', canLinkLocal: false, canLinkDrive: true });
    expect(state.folder).toMatchObject({ name: 'Textbooks', provider: 'google-drive' });
    expect(notify).toHaveBeenCalledWith('Linked “Textbooks”', 'neutral');

    const [doc] = await listDocuments();
    expect(doc).toMatchObject({
      id: bookId,
      title: 'Mechanics',
      source: { kind: 'folder', path: 'Physics/Mechanics.pdf' },
    });
    expect(drive.readText('Textbooks/.scriptorium/README.txt')).toContain('Scriptorium');

    await putNote(note('n1', bookId, 'Saved in Drive'));
    await vi.waitFor(async () => {
      const { id } = await getDevice();
      const text = drive.readText(`Textbooks/.scriptorium/devices/${id}/${bookId}.json`);
      expect(text && JSON.parse(text).data.notes[0].text).toBe('Saved in Drive');
    });
    await engine.whenIdle();
    // Scriptorium only adds its own files; the PDF is untouched.
    expect(drive.readText('Textbooks/Physics/Mechanics.pdf')).toBe(PDF);
  });

  it('merges notes other devices left in Drive', async () => {
    const file = createBookFile(
      { id: bookId, title: 'Mechanics', fileName: 'Mechanics.pdf', pageCount: 36 },
      LAPTOP,
      {
        notes: [note('laptop-note', bookId, 'From my laptop')],
        highlights: [],
        bookmarks: [],
        tombstones: [],
      },
    );
    drive.write(`Textbooks/.scriptorium/devices/${LAPTOP.id}/${bookId}.json`, JSON.stringify(file));
    const { notify } = await linked();
    expect((await listNotes(bookId)).map((n) => n.text)).toEqual(['From my laptop']);
    expect(notify).toHaveBeenCalledWith('Linked “Textbooks”. Found notes from 1 other device.', 'neutral');
    expect(useSyncStore.getState().devices.map((d) => d.name)).toEqual(['Edge on Windows']);
  });

  it('asks to reconnect when Google’s sign-in lapses or is revoked, and resumes after signing in', async () => {
    const { engine } = await linked();
    session.auth.signedIn = false;
    await engine.sync();
    expect(useSyncStore.getState().status).toBe('needs-permission');

    await engine.reconnect();
    await engine.whenIdle();
    expect(session.auth.authorizeCalls).toBe(1);
    expect(useSyncStore.getState().status).toBe('idle');

    // A token Google no longer accepts (e.g. access revoked in the Google account).
    drive.token = 'rotated';
    await engine.sync();
    expect(useSyncStore.getState().status).toBe('needs-permission');
    expect(session.auth.signedIn).toBe(false);
  });

  it('says so when signing in again doesn’t work', async () => {
    const { engine, notify } = await linked();
    session.auth.signedIn = false;
    session.auth.failWith = new Error('Google sign-in was closed before it finished.');
    await engine.reconnect();
    expect(useSyncStore.getState().status).toBe('needs-permission');
    expect(notify).toHaveBeenLastCalledWith(
      'Scriptorium is still signed out of Google Drive. Sign in to keep “Textbooks” in sync.',
      'error',
    );
  });

  it('is remembered between visits by its Drive id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await linked({ folderStore: metaFolderStore });
    const next = engineFor({ folderStore: metaFolderStore });
    await next.engine.start();
    await next.engine.whenIdle();
    expect(useSyncStore.getState()).toMatchObject({
      status: 'idle',
      folder: { name: 'Textbooks', provider: 'google-drive' },
    });
    expect(session.auth.hint).toBe('reader@example.com');

    session.auth.signedIn = false;
    const later = engineFor({ folderStore: metaFolderStore });
    await later.engine.start();
    expect(useSyncStore.getState().status).toBe('needs-permission');
    warn.mockRestore();
  });

  it('reports a sign-in that fails while linking, and ignores a cancelled chooser', async () => {
    const failing = engineFor({
      pickDriveFolder: async () => {
        throw new Error('Google didn’t give Scriptorium access to your Drive.');
      },
    });
    await failing.engine.start();
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    await failing.engine.link('google-drive');
    expect(failing.notify).toHaveBeenCalledWith(
      'Google didn’t give Scriptorium access to your Drive.',
      'error',
    );

    const cancelled = engineFor({
      pickDriveFolder: async () => {
        throw new DOMException('No folder was chosen.', 'AbortError');
      },
    });
    await cancelled.engine.start();
    await cancelled.engine.link('google-drive');
    expect(cancelled.notify).not.toHaveBeenCalled();
    expect(useSyncStore.getState().status).toBe('unlinked');
  });

  it('isn’t offered as a local folder where browsers can’t link one', async () => {
    const { engine, notify } = engineFor();
    await engine.start();
    await engine.link();
    expect(notify).toHaveBeenCalledWith(
      'This browser can’t link folders. Use Chrome or Edge on a computer.',
      'error',
    );
    expect(useSyncStore.getState().status).toBe('unlinked');
  });
});

describe('reading books from Google Drive', () => {
  const downloads = () => drive.log.filter((entry) => entry.startsWith('GET /drive/v3/files/item-')).length;

  it('identifies new books three at a time, adding each once even when copies finish together', async () => {
    for (const name of ['Algebra', 'Biology', 'Chemistry', 'Dynamics', 'Economics']) {
      drive.write(`Textbooks/${name}.pdf`, `%PDF-1.7 ${name}`);
    }
    drive.write('Textbooks/Copies/Mechanics.pdf', PDF);
    drive.downloadDelayMs = 20;
    const seen: number[] = [];
    const unsubscribe = useSyncStore.subscribe((state) => {
      if (state.progress) seen.push(state.progress.done);
    });
    await linked();
    unsubscribe();

    expect(drive.maxConcurrentDownloads).toBe(3);
    expect(downloads()).toBe(7);
    expect(seen.at(-1)).toBe(7);
    const docs = await listDocuments();
    expect(docs).toHaveLength(6);
    expect(docs.find((doc) => doc.id === bookId)?.source).toEqual({
      kind: 'folder',
      path: 'Copies/Mechanics.pdf',
    });
  });

  it('downloads each PDF once when linking, and opens it from that copy', async () => {
    const { engine } = await linked();
    expect(downloads()).toBe(1);
    provideFolderAccess(engine);
    expect(new TextDecoder().decode(await readBookBytes((await getDocument(bookId))!))).toBe(PDF);
    expect(downloads()).toBe(1);
  });

  it('opens a kept book straight after a reload, before the folder is restored and signed out', async () => {
    await linked({ folderStore: metaFolderStore });
    session.auth.signedIn = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowStore: FolderStore = {
      ...metaFolderStore,
      load: async () => {
        await gate;
        return metaFolderStore.load();
      },
    };
    const { engine } = engineFor({ folderStore: slowStore });
    const started = engine.start();
    provideFolderAccess(engine);
    const reading = readBookBytes((await getDocument(bookId))!);
    release();
    expect(new TextDecoder().decode(await reading)).toBe(PDF);
    await started;
    expect(session.auth.authorizeCalls).toBe(0);
  });

  it('downloads a book that isn’t kept, then opens it from the browser even when signed out', async () => {
    const { engine } = await linked();
    provideFolderAccess(engine);
    const doc = (await getDocument(bookId))!;
    await session.books.clear();
    const before = downloads();

    expect(new TextDecoder().decode(await readBookBytes(doc))).toBe(PDF);
    expect(downloads()).toBe(before + 1);

    session.auth.signedIn = false;
    expect(new TextDecoder().decode(await readBookBytes(doc))).toBe(PDF);
    expect(downloads()).toBe(before + 1);
  });

  it('asks to sign in again for a book not kept yet, and explains failed downloads', async () => {
    const { engine } = await linked();
    provideFolderAccess(engine);
    const doc = (await getDocument(bookId))!;
    await session.books.clear();
    session.auth.signedIn = false;
    await engine.sync();
    await expect(readBookBytes(doc)).rejects.toThrow(
      'Sign in to Google Drive again to open books from “Textbooks”. Go back to the library and choose Reconnect — your notes are kept.',
    );

    await engine.reconnect();
    await engine.whenIdle();
    drive.failNext((request) => request.url.includes('alt=media'), 503, '', 10);
    await expect(readBookBytes(doc)).rejects.toThrow(
      'Couldn’t download “Mechanics.pdf” from Google Drive. Check your connection and try again.',
    );
  });

  it('lets go of kept books when the folder is unlinked', async () => {
    const { engine } = await linked();
    provideFolderAccess(engine);
    await readBookBytes((await getDocument(bookId))!);
    expect(session.caches.size).toBe(1);
    await engine.unlink();
    expect(session.caches.size).toBe(0);
    expect(await listDocuments()).toEqual([]);
  });
});
