import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppSettings,
  Bookmark,
  DocId,
  Highlight,
  LibraryDocument,
  MarginNote,
  ReadingState,
  Tombstone,
} from '../types';

export const DB_NAME = 'scriptorium';
export const DB_VERSION = 3;

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
  /** Added in schema version 2. */
  highlights: {
    key: string;
    value: Highlight;
    indexes: { docId: DocId };
  };
  settings: {
    key: 'app';
    value: AppSettings;
  };
  /** Added in schema version 3: deleted annotations, so deletions sync. */
  tombstones: {
    key: string;
    value: Tombstone;
    indexes: { docId: DocId };
  };
  /** Added in schema version 3: small records such as device identity and the linked folder. */
  meta: {
    key: string;
    value: unknown;
  };
  /** Added in schema version 3: content hashes of PDFs in the linked folder, so rescans stay cheap. */
  folderFiles: {
    key: string;
    value: FolderFileRecord;
  };
}

/** Cached identity of a PDF in the linked folder; rehashed only when size or mtime change. */
export interface FolderFileRecord {
  path: string;
  size: number;
  lastModified: number;
  hash: DocId;
}

let dbPromise: Promise<IDBPDatabase<ScriptoriumDB>> | null = null;

/**
 * Creates the object stores a database at `oldVersion` is missing. Each step
 * only adds stores introduced by its version, so existing data is never touched.
 */
export function upgradeSchema(db: IDBPDatabase<ScriptoriumDB>, oldVersion: number): void {
  if (oldVersion < 1) {
    const documents = db.createObjectStore('documents', { keyPath: 'id' });
    documents.createIndex('lastOpenedAt', 'lastOpenedAt');
    db.createObjectStore('files');
    db.createObjectStore('readingState', { keyPath: 'docId' });
    const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' });
    bookmarks.createIndex('docId', 'docId');
    const notes = db.createObjectStore('notes', { keyPath: 'id' });
    notes.createIndex('docId', 'docId');
    db.createObjectStore('settings');
  }
  if (oldVersion < 2) {
    const highlights = db.createObjectStore('highlights', { keyPath: 'id' });
    highlights.createIndex('docId', 'docId');
  }
  if (oldVersion < 3) {
    const tombstones = db.createObjectStore('tombstones', { keyPath: 'id' });
    tombstones.createIndex('docId', 'docId');
    db.createObjectStore('meta');
    db.createObjectStore('folderFiles', { keyPath: 'path' });
  }
}

export function getDB(): Promise<IDBPDatabase<ScriptoriumDB>> {
  dbPromise ??= openDB<ScriptoriumDB>(DB_NAME, DB_VERSION, {
    upgrade: upgradeSchema,
    blocked() {
      console.warn(
        'Scriptorium: another tab is using an older version of the library; close it to finish updating.',
      );
    },
    blocking() {
      // A newer tab wants to upgrade the database: release ours so it can.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
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
