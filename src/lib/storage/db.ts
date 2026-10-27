import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, Bookmark, DocId, LibraryDocument, MarginNote, ReadingState } from '../types';

export const DB_NAME = 'scriptorium';
export const DB_VERSION = 1;

export interface ScriptoriumDB extends DBSchema {
  documents: {
    key: DocId;
    value: LibraryDocument;
    indexes: { lastOpenedAt: number };
  };
  /** Raw PDF bytes, keyed by document id. Kept separate so listing the library stays cheap. */
  files: {
    key: DocId;
    value: Blob;
  };
  readingState: {
    key: DocId;
    value: ReadingState;
  };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: { docId: DocId };
  };
  notes: {
    key: string;
    value: MarginNote;
    indexes: { docId: DocId };
  };
  settings: {
    key: 'app';
    value: AppSettings;
  };
}

let dbPromise: Promise<IDBPDatabase<ScriptoriumDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ScriptoriumDB>> {
  dbPromise ??= openDB<ScriptoriumDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const documents = db.createObjectStore('documents', { keyPath: 'id' });
      documents.createIndex('lastOpenedAt', 'lastOpenedAt');
      db.createObjectStore('files');
      db.createObjectStore('readingState', { keyPath: 'docId' });
      const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' });
      bookmarks.createIndex('docId', 'docId');
      const notes = db.createObjectStore('notes', { keyPath: 'id' });
      notes.createIndex('docId', 'docId');
      db.createObjectStore('settings');
    },
  });
  return dbPromise;
}

/** Test helper: closes and forgets the cached connection. */
export async function resetDBForTests(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
}
