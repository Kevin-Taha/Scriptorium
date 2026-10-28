import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Highlight, LibraryDocument, MarginNote } from '../types';
import { DB_NAME, DB_VERSION, getDB, resetDBForTests } from './db';
import {
  deleteBookmark,
  deleteDocument,
  deleteHighlight,
  deleteNote,
  getBookData,
  getDocumentFile,
  getReadingState,
  getSettings,
  listBookmarks,
  listDocIdsWithData,
  listDocuments,
  listHighlights,
  listNotes,
  onLibraryChange,
  putBookmark,
  putDocument,
  putHighlight,
  putNote,
  putReadingState,
  putSettings,
  updateBookData,
  updateDocument,
} from './repository';

function makeDoc(id: string, lastOpenedAt: number): LibraryDocument {
  return { id, title: id, fileName: `${id}.pdf`, fileSize: 1, pageCount: 10, addedAt: 0, lastOpenedAt };
}

function makeNote(id: string, docId: string, page: number, y: number): MarginNote {
  return { id, docId, page, y, text: id, color: 'amber', createdAt: 0, updatedAt: 0 };
}

function makeHighlight(id: string, docId: string, page: number, y: number, createdAt = 0): Highlight {
  return {
    id,
    docId,
    page,
    rects: [{ x: 0.1, y, w: 0.5, h: 0.02 }],
    text: id,
    color: 'sky',
    createdAt,
    updatedAt: createdAt,
  };
}

beforeEach(async () => {
  await resetDBForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

afterEach(resetDBForTests);

describe('sync bookkeeping', () => {
  it('records a tombstone for each deleted annotation and announces the change', async () => {
    const changes: string[] = [];
    const stop = onLibraryChange(({ docId }) => changes.push(docId));
    await putNote(makeNote('n1', 'book', 1, 0.1));
    await putHighlight(makeHighlight('h1', 'book', 1, 0.2));
    await putBookmark({ id: 'b1', docId: 'book', page: 2, label: 'x', createdAt: 0 });
    await deleteNote('n1');
    await deleteHighlight('h1');
    await deleteBookmark('b1');
    await deleteNote('missing');
    stop();

    const data = await getBookData('book');
    expect(data.notes).toEqual([]);
    expect(data.tombstones.map((t) => [t.id, t.kind]).sort()).toEqual([
      ['b1', 'bookmark'],
      ['h1', 'highlight'],
      ['n1', 'note'],
    ]);
    expect(changes).toEqual(['book', 'book', 'book', 'book', 'book', 'book']);
  });

  it('clears a tombstone when the annotation is put back (Undo)', async () => {
    await putHighlight(makeHighlight('h1', 'book', 1, 0.2));
    await deleteHighlight('h1');
    await putHighlight(makeHighlight('h1', 'book', 1, 0.2, 5));
    const data = await getBookData('book');
    expect(data.highlights.map((h) => h.id)).toEqual(['h1']);
    expect(data.tombstones).toEqual([]);
  });

  it('stamps a deletion after the deleted version, even if this device’s clock is behind', async () => {
    const future = Date.now() + 3_600_000;
    await putNote({ ...makeNote('n1', 'book', 1, 0.1), updatedAt: future });
    await deleteNote('n1');
    const [tombstone] = (await getBookData('book')).tombstones;
    expect(tombstone.deletedAt).toBeGreaterThan(future);
  });

  it('announces reading progress but not document metadata changes', async () => {
    const changes: string[] = [];
    const stop = onLibraryChange(({ docId }) => changes.push(docId));
    await putDocument(makeDoc('book', 1));
    await updateDocument('book', { lastOpenedAt: 2 });
    await putReadingState({
      docId: 'book',
      location: { page: 3, offset: 0 },
      zoom: { mode: 'fit-width', scale: 1 },
      updatedAt: 1,
    });
    stop();
    expect(changes).toEqual(['book']);
  });

  it('transforms a book’s data atomically and leaves it alone when told to', async () => {
    await putNote(makeNote('keep', 'book', 1, 0.1));
    await putNote(makeNote('drop', 'book', 2, 0.1));
    await putNote(makeNote('other', 'elsewhere', 1, 0.1));

    expect(await updateBookData('book', () => null)).toBeNull();
    expect(await listNotes('book')).toHaveLength(2);

    await updateBookData('book', (current) => ({
      ...current,
      notes: current.notes.filter((n) => n.id === 'keep'),
      tombstones: [{ id: 'drop', kind: 'note', docId: 'book', deletedAt: 9 }],
    }));
    expect((await listNotes('book')).map((n) => n.id)).toEqual(['keep']);
    expect((await getBookData('book')).tombstones.map((t) => t.id)).toEqual(['drop']);
    expect(await listNotes('elsewhere')).toHaveLength(1);
  });

  it('lists every book that has data, with or without a library entry', async () => {
    await putNote(makeNote('n1', 'a', 1, 0.1));
    await putReadingState({
      docId: 'b',
      location: { page: 1, offset: 0 },
      zoom: { mode: 'fit-width', scale: 1 },
      updatedAt: 1,
    });
    await putHighlight(makeHighlight('h1', 'c', 1, 0.2));
    await deleteHighlight('h1');
    expect((await listDocIdsWithData()).sort()).toEqual(['a', 'b', 'c']);
  });

  it('removes a document’s tombstones along with the document', async () => {
    await putDocument(makeDoc('book', 1));
    await putNote(makeNote('n1', 'book', 1, 0.1));
    await deleteNote('n1');
    await deleteDocument('book');
    expect(await listDocIdsWithData()).toEqual([]);
  });
});

describe('repository', () => {
  it('lists documents most-recent first and updates them', async () => {
    await putDocument(makeDoc('a', 1));
    await putDocument(makeDoc('b', 2), new Blob(['%PDF']));
    expect((await listDocuments()).map((d) => d.id)).toEqual(['b', 'a']);

    await updateDocument('a', { lastOpenedAt: 3 });
    expect((await listDocuments()).map((d) => d.id)).toEqual(['a', 'b']);
    // happy-dom Blobs don't survive fake-indexeddb's structured clone intact; presence is what matters here.
    expect(await getDocumentFile('b')).toBeDefined();
    expect(await getDocumentFile('a')).toBeUndefined();
  });

  it('orders notes by page then vertical position', async () => {
    await putNote(makeNote('n3', 'd', 2, 0.1));
    await putNote(makeNote('n1', 'd', 1, 0.8));
    await putNote(makeNote('n2', 'd', 1, 0.2));
    await putNote(makeNote('other', 'x', 1, 0));
    expect((await listNotes('d')).map((n) => n.id)).toEqual(['n2', 'n1', 'n3']);
  });

  it('stores highlights per document in reading order and deletes them individually', async () => {
    await putHighlight(makeHighlight('h3', 'd', 2, 0.1));
    await putHighlight(makeHighlight('h1', 'd', 1, 0.8));
    await putHighlight(makeHighlight('h2', 'd', 1, 0.2));
    await putHighlight(makeHighlight('tie', 'd', 1, 0.2, 5));
    await putHighlight(makeHighlight('other', 'x', 1, 0));
    expect((await listHighlights('d')).map((h) => h.id)).toEqual(['h2', 'tie', 'h1', 'h3']);

    await deleteHighlight('h2');
    expect((await listHighlights('d')).map((h) => h.id)).toEqual(['tie', 'h1', 'h3']);
    expect((await listHighlights('x')).map((h) => h.id)).toEqual(['other']);
  });

  it('keeps a note’s link to its highlight', async () => {
    await putNote({ ...makeNote('n', 'd', 1, 0.5), highlightId: 'h' });
    expect((await listNotes('d'))[0].highlightId).toBe('h');
  });

  it('deletes a document with all of its attached data', async () => {
    await putDocument(makeDoc('d', 1), new Blob(['%PDF']));
    await putReadingState({
      docId: 'd',
      location: { page: 4, offset: 0.5 },
      zoom: { mode: 'custom', scale: 1.2 },
      updatedAt: 1,
    });
    await putBookmark({ id: 'b1', docId: 'd', page: 3, label: 'x', createdAt: 0 });
    await putNote(makeNote('n1', 'd', 1, 0.5));
    await putNote(makeNote('keep', 'other', 1, 0.5));
    await putHighlight(makeHighlight('h1', 'd', 1, 0.5));
    await putHighlight(makeHighlight('keep-h', 'other', 1, 0.5));

    await deleteDocument('d');

    expect(await listDocuments()).toEqual([]);
    expect(await getDocumentFile('d')).toBeUndefined();
    expect(await getReadingState('d')).toBeUndefined();
    expect(await listBookmarks('d')).toEqual([]);
    expect(await listNotes('d')).toEqual([]);
    expect(await listHighlights('d')).toEqual([]);
    expect(await listNotes('other')).toHaveLength(1);
    expect(await listHighlights('other')).toHaveLength(1);
  });

  it('returns default settings until saved', async () => {
    expect(await getSettings()).toEqual({ theme: 'light', invertPagesInDark: false });
    await putSettings({ theme: 'dark', invertPagesInDark: true });
    expect(await getSettings()).toEqual({ theme: 'dark', invertPagesInDark: true });
  });
});

describe('schema upgrade', () => {
  /** A database exactly as version 1 of the app created it, holding a reader's data. */
  async function createVersion1Database(): Promise<void> {
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const documents = db.createObjectStore('documents', { keyPath: 'id' });
        documents.createIndex('lastOpenedAt', 'lastOpenedAt');
        db.createObjectStore('files');
        db.createObjectStore('readingState', { keyPath: 'docId' });
        db.createObjectStore('bookmarks', { keyPath: 'id' }).createIndex('docId', 'docId');
        db.createObjectStore('notes', { keyPath: 'id' }).createIndex('docId', 'docId');
        db.createObjectStore('settings');
      },
    });
    await v1.put('documents', makeDoc('book', 7));
    await v1.put('notes', makeNote('n1', 'book', 3, 0.4));
    await v1.put('bookmarks', { id: 'b1', docId: 'book', page: 2, label: 'Intro', createdAt: 1 });
    await v1.put('settings', { theme: 'sepia', invertPagesInDark: false }, 'app');
    v1.close();
  }

  it('upgrades a version 1 database to the current schema without losing data', async () => {
    await createVersion1Database();

    const db = await getDB();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(
      [
        'bookmarks',
        'documents',
        'files',
        'folderFiles',
        'highlights',
        'meta',
        'notes',
        'readingState',
        'settings',
        'tombstones',
      ].sort(),
    );

    expect((await listDocuments()).map((d) => d.id)).toEqual(['book']);
    expect((await listNotes('book')).map((n) => n.id)).toEqual(['n1']);
    expect((await listBookmarks('book')).map((b) => b.label)).toEqual(['Intro']);
    expect(await getSettings()).toEqual({ theme: 'sepia', invertPagesInDark: false });

    await putHighlight(makeHighlight('h1', 'book', 3, 0.4));
    expect((await listHighlights('book')).map((h) => h.id)).toEqual(['h1']);
    expect(db.transaction('highlights').store.indexNames.contains('docId')).toBe(true);
  });

  it('creates every store when there is no database yet', async () => {
    const db = await getDB();
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains('highlights')).toBe(true);
    expect(db.objectStoreNames.contains('notes')).toBe(true);
  });

  it('leaves an up-to-date database alone when reopened', async () => {
    await putNote(makeNote('n1', 'book', 1, 0.1));
    await putHighlight(makeHighlight('h1', 'book', 1, 0.1));
    await resetDBForTests();

    expect(await listNotes('book')).toHaveLength(1);
    expect(await listHighlights('book')).toHaveLength(1);
  });
});
