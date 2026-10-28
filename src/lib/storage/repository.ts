import {
  DEFAULT_SETTINGS,
  type AnnotationKind,
  type AppSettings,
  type Bookmark,
  type DocId,
  type Highlight,
  type LibraryDocument,
  type MarginNote,
  type ReadingState,
  type Tombstone,
} from '../types';
import { type FolderFileRecord, getDB } from './db';

/**
 * Typed persistence API. Every feature goes through these functions rather than
 * touching IndexedDB directly, so the backing store can be swapped later
 * (e.g. a filesystem store in a desktop build).
 */

// ------------------------------------------------------------ change events

export interface LibraryChange {
  docId: DocId;
}

type ChangeListener = (change: LibraryChange) => void;
const changeListeners = new Set<ChangeListener>();

/**
 * Notifies `listener` after any annotation or reading-progress write for a
 * book. Sync uses this to know which books to upload. Returns an unsubscribe.
 */
export function onLibraryChange(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function emitChange(docId: DocId): void {
  for (const listener of changeListeners) listener({ docId });
}

// ---------------------------------------------------------------- documents

export async function listDocuments(): Promise<LibraryDocument[]> {
  const db = await getDB();
  const docs = await db.getAll('documents');
  return docs.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getDocument(id: DocId): Promise<LibraryDocument | undefined> {
  return (await getDB()).get('documents', id);
}

export async function putDocument(doc: LibraryDocument, file?: Blob): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['documents', 'files'], 'readwrite');
  await tx.objectStore('documents').put(doc);
  if (file) await tx.objectStore('files').put(file, doc.id);
  await tx.done;
}

export async function updateDocument(id: DocId, patch: Partial<Omit<LibraryDocument, 'id'>>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('documents', 'readwrite');
  const existing = await tx.store.get(id);
  if (existing) await tx.store.put({ ...existing, ...patch });
  await tx.done;
}

/** The book's bytes when they are stored in the browser (imported books). */
export async function getDocumentFile(id: DocId): Promise<Blob | undefined> {
  return (await getDB()).get('files', id);
}

/** Drops a book's browser copy, keeping its library entry (e.g. once it lives in the folder). */
export async function deleteDocumentFile(id: DocId): Promise<void> {
  await (await getDB()).delete('files', id);
}

/**
 * Removes a book and everything attached to it on this device (file,
 * progress, bookmarks, notes, highlights). Deliberately records no
 * tombstones: removing a book here does not erase its notes on other devices.
 */
export async function deleteDocument(id: DocId): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['documents', 'files', 'readingState', 'bookmarks', 'notes', 'highlights', 'tombstones'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('documents').delete(id),
    tx.objectStore('files').delete(id),
    tx.objectStore('readingState').delete(id),
  ]);
  for (const storeName of ['bookmarks', 'notes', 'highlights', 'tombstones'] as const) {
    const store = tx.objectStore(storeName);
    for (const key of await store.index('docId').getAllKeys(id)) await store.delete(key);
  }
  await tx.done;
}

// ------------------------------------------------------------ reading state

export async function getReadingState(docId: DocId): Promise<ReadingState | undefined> {
  return (await getDB()).get('readingState', docId);
}

export async function putReadingState(state: ReadingState): Promise<void> {
  await (await getDB()).put('readingState', state);
  emitChange(state.docId);
}

// ------------------------------------------------------ annotations (shared)

const STORE_FOR_KIND = { note: 'notes', highlight: 'highlights', bookmark: 'bookmarks' } as const;

async function deleteAnnotation(kind: AnnotationKind, id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_FOR_KIND[kind], 'tombstones'], 'readwrite');
  const store = tx.objectStore(STORE_FOR_KIND[kind]);
  const existing = (await store.get(id)) as { docId: DocId } | undefined;
  if (!existing) {
    await tx.done;
    return;
  }
  const tombstone: Tombstone = { id, kind, docId: existing.docId, deletedAt: Date.now() };
  await Promise.all([store.delete(id), tx.objectStore('tombstones').put(tombstone), tx.done]);
  emitChange(existing.docId);
}

// ---------------------------------------------------------------- bookmarks

export async function listBookmarks(docId: DocId): Promise<Bookmark[]> {
  const items = await (await getDB()).getAllFromIndex('bookmarks', 'docId', docId);
  return items.sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
}

export async function putBookmark(bookmark: Bookmark): Promise<void> {
  const tx = (await getDB()).transaction(['bookmarks', 'tombstones'], 'readwrite');
  // A put revives a record deleted earlier (e.g. Undo), so its tombstone goes.
  await Promise.all([
    tx.objectStore('bookmarks').put(bookmark),
    tx.objectStore('tombstones').delete(bookmark.id),
    tx.done,
  ]);
  emitChange(bookmark.docId);
}

export function deleteBookmark(id: string): Promise<void> {
  return deleteAnnotation('bookmark', id);
}

// -------------------------------------------------------------------- notes

export async function listNotes(docId: DocId): Promise<MarginNote[]> {
  const items = await (await getDB()).getAllFromIndex('notes', 'docId', docId);
  return items.sort((a, b) => a.page - b.page || a.y - b.y || a.createdAt - b.createdAt);
}

export async function putNote(note: MarginNote): Promise<void> {
  const tx = (await getDB()).transaction(['notes', 'tombstones'], 'readwrite');
  await Promise.all([
    tx.objectStore('notes').put(note),
    tx.objectStore('tombstones').delete(note.id),
    tx.done,
  ]);
  emitChange(note.docId);
}

export function deleteNote(id: string): Promise<void> {
  return deleteAnnotation('note', id);
}

// --------------------------------------------------------------- highlights

/** Reading order: by page, then top to bottom, then oldest first. */
export async function listHighlights(docId: DocId): Promise<Highlight[]> {
  const items = await (await getDB()).getAllFromIndex('highlights', 'docId', docId);
  const top = (h: Highlight) => h.rects[0]?.y ?? 0;
  return items.sort((a, b) => a.page - b.page || top(a) - top(b) || a.createdAt - b.createdAt);
}

export async function putHighlight(highlight: Highlight): Promise<void> {
  const tx = (await getDB()).transaction(['highlights', 'tombstones'], 'readwrite');
  await Promise.all([
    tx.objectStore('highlights').put(highlight),
    tx.objectStore('tombstones').delete(highlight.id),
    tx.done,
  ]);
  emitChange(highlight.docId);
}

export function deleteHighlight(id: string): Promise<void> {
  return deleteAnnotation('highlight', id);
}

// ------------------------------------------------- whole-book data (sync)

/** Everything a reader has added to one book: the unit that sync and backups move around. */
export interface BookData {
  notes: MarginNote[];
  highlights: Highlight[];
  bookmarks: Bookmark[];
  tombstones: Tombstone[];
  progress?: ReadingState;
}

export async function getBookData(docId: DocId): Promise<BookData> {
  const db = await getDB();
  const tx = db.transaction(['notes', 'highlights', 'bookmarks', 'tombstones', 'readingState']);
  const [notes, highlights, bookmarks, tombstones, progress] = await Promise.all([
    tx.objectStore('notes').index('docId').getAll(docId),
    tx.objectStore('highlights').index('docId').getAll(docId),
    tx.objectStore('bookmarks').index('docId').getAll(docId),
    tx.objectStore('tombstones').index('docId').getAll(docId),
    tx.objectStore('readingState').get(docId),
  ]);
  await tx.done;
  return { notes, highlights, bookmarks, tombstones, progress };
}

/**
 * Atomically transforms a book's annotations, tombstones and progress: reads
 * them, passes them to `update`, and writes the result in the same
 * transaction, so a concurrent local edit can't be lost in between. `update`
 * must be synchronous; return null to leave the data untouched. Emits no change
 * event, since the new data came from elsewhere (another device or a backup).
 */
export async function updateBookData(
  docId: DocId,
  update: (current: BookData) => BookData | null,
): Promise<BookData | null> {
  const db = await getDB();
  const stores = ['notes', 'highlights', 'bookmarks', 'tombstones'] as const;
  const tx = db.transaction(['notes', 'highlights', 'bookmarks', 'tombstones', 'readingState'], 'readwrite');
  const [notes, highlights, bookmarks, tombstones, progress] = await Promise.all([
    tx.objectStore('notes').index('docId').getAll(docId),
    tx.objectStore('highlights').index('docId').getAll(docId),
    tx.objectStore('bookmarks').index('docId').getAll(docId),
    tx.objectStore('tombstones').index('docId').getAll(docId),
    tx.objectStore('readingState').get(docId),
  ]);
  const next = update({ notes, highlights, bookmarks, tombstones, progress });
  if (!next) {
    await tx.done;
    return null;
  }
  const writes: Promise<unknown>[] = [];
  for (const name of stores) {
    const store = tx.objectStore(name);
    const keep = new Set(next[name].map((r) => r.id));
    for (const record of { notes, highlights, bookmarks, tombstones }[name]) {
      if (!keep.has(record.id)) writes.push(store.delete(record.id));
    }
  }
  for (const note of next.notes) writes.push(tx.objectStore('notes').put(note));
  for (const highlight of next.highlights) writes.push(tx.objectStore('highlights').put(highlight));
  for (const bookmark of next.bookmarks) writes.push(tx.objectStore('bookmarks').put(bookmark));
  for (const tombstone of next.tombstones) writes.push(tx.objectStore('tombstones').put(tombstone));
  if (next.progress) writes.push(tx.objectStore('readingState').put(next.progress));
  await Promise.all([...writes, tx.done]);
  return next;
}

/** Ids of every book that has notes, highlights, bookmarks, deletions or progress on this device. */
export async function listDocIdsWithData(): Promise<DocId[]> {
  const db = await getDB();
  const ids = new Set<DocId>();
  for (const name of ['notes', 'highlights', 'bookmarks', 'tombstones'] as const) {
    for (const record of await db.getAll(name)) ids.add(record.docId);
  }
  for (const key of await db.getAllKeys('readingState')) ids.add(key);
  return [...ids];
}

// --------------------------------------------------------------------- meta

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await getDB()).get('meta', key)) as T | undefined;
}

export async function putMeta(key: string, value: unknown): Promise<void> {
  await (await getDB()).put('meta', value, key);
}

export async function deleteMeta(key: string): Promise<void> {
  await (await getDB()).delete('meta', key);
}

// ------------------------------------------------------------- folder index

export async function listFolderFiles(): Promise<FolderFileRecord[]> {
  return (await getDB()).getAll('folderFiles');
}

export async function putFolderFile(record: FolderFileRecord): Promise<void> {
  await (await getDB()).put('folderFiles', record);
}

export async function deleteFolderFile(path: string): Promise<void> {
  await (await getDB()).delete('folderFiles', path);
}

export async function clearFolderFiles(): Promise<void> {
  await (await getDB()).clear('folderFiles');
}

// ----------------------------------------------------------------- settings

export async function getSettings(): Promise<AppSettings> {
  const stored = await (await getDB()).get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function putSettings(settings: AppSettings): Promise<void> {
  await (await getDB()).put('settings', settings, 'app');
}
