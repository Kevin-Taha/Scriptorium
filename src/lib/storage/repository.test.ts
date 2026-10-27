import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LibraryDocument, MarginNote } from '../types';
import { DB_NAME, resetDBForTests } from './db';
import {
  deleteDocument,
  getDocumentFile,
  getReadingState,
  getSettings,
  listBookmarks,
  listDocuments,
  listNotes,
  putBookmark,
  putDocument,
  putNote,
  putReadingState,
  putSettings,
  updateDocument,
} from './repository';

function makeDoc(id: string, lastOpenedAt: number): LibraryDocument {
  return { id, title: id, fileName: `${id}.pdf`, fileSize: 1, pageCount: 10, addedAt: 0, lastOpenedAt };
}

function makeNote(id: string, docId: string, page: number, y: number): MarginNote {
  return { id, docId, page, y, text: id, color: 'amber', createdAt: 0, updatedAt: 0 };
}

beforeEach(async () => {
  await resetDBForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

afterEach(resetDBForTests);

describe('repository', () => {
  it('lists documents most-recent first and updates them', async () => {
    await putDocument(makeDoc('a', 1));
    await putDocument(makeDoc('b', 2), new Blob(['%PDF']));
    expect((await listDocuments()).map((d) => d.id)).toEqual(['b', 'a']);

    await updateDocument('a', { lastOpenedAt: 3 });
    expect((await listDocuments()).map((d) => d.id)).toEqual(['a', 'b']);
    // jsdom Blobs don't survive fake-indexeddb's structured clone intact; presence is what matters here.
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

  it('deletes a document with all of its attached data', async () => {
    await putDocument(makeDoc('d', 1), new Blob(['%PDF']));
    await putReadingState({ docId: 'd', location: { page: 4, offset: 0.5 }, zoom: { mode: 'custom', scale: 1.2 }, updatedAt: 1 });
    await putBookmark({ id: 'b1', docId: 'd', page: 3, label: 'x', createdAt: 0 });
    await putNote(makeNote('n1', 'd', 1, 0.5));
    await putNote(makeNote('keep', 'other', 1, 0.5));

    await deleteDocument('d');

    expect(await listDocuments()).toEqual([]);
    expect(await getDocumentFile('d')).toBeUndefined();
    expect(await getReadingState('d')).toBeUndefined();
    expect(await listBookmarks('d')).toEqual([]);
    expect(await listNotes('d')).toEqual([]);
    expect(await listNotes('other')).toHaveLength(1);
  });

  it('returns default settings until saved', async () => {
    expect(await getSettings()).toEqual({ theme: 'light', invertPagesInDark: false });
    await putSettings({ theme: 'dark', invertPagesInDark: true });
    expect(await getSettings()).toEqual({ theme: 'dark', invertPagesInDark: true });
  });
});
