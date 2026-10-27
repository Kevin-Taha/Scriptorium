import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Bookmark,
  type DocId,
  type Highlight,
  type LibraryDocument,
  type MarginNote,
  type ReadingState,
} from '../types';
import { getDB } from './db';

/**
 * Typed persistence API. Every feature goes through these functions rather than
 * touching IndexedDB directly, so the backing store can be swapped later
 * (e.g. a filesystem store in a desktop build).
 */

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

export async function getDocumentFile(id: DocId): Promise<Blob | undefined> {
  return (await getDB()).get('files', id);
}

/** Removes a document and everything attached to it (file, progress, bookmarks, notes, highlights). */
export async function deleteDocument(id: DocId): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['documents', 'files', 'readingState', 'bookmarks', 'notes', 'highlights'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('documents').delete(id),
    tx.objectStore('files').delete(id),
    tx.objectStore('readingState').delete(id),
  ]);
  for (const storeName of ['bookmarks', 'notes', 'highlights'] as const) {
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
}

// ---------------------------------------------------------------- bookmarks

export async function listBookmarks(docId: DocId): Promise<Bookmark[]> {
  const items = await (await getDB()).getAllFromIndex('bookmarks', 'docId', docId);
  return items.sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
}

export async function putBookmark(bookmark: Bookmark): Promise<void> {
  await (await getDB()).put('bookmarks', bookmark);
}

export async function deleteBookmark(id: string): Promise<void> {
  await (await getDB()).delete('bookmarks', id);
}

// -------------------------------------------------------------------- notes

export async function listNotes(docId: DocId): Promise<MarginNote[]> {
  const items = await (await getDB()).getAllFromIndex('notes', 'docId', docId);
  return items.sort((a, b) => a.page - b.page || a.y - b.y || a.createdAt - b.createdAt);
}

export async function putNote(note: MarginNote): Promise<void> {
  await (await getDB()).put('notes', note);
}

export async function deleteNote(id: string): Promise<void> {
  await (await getDB()).delete('notes', id);
}

// --------------------------------------------------------------- highlights

/** Reading order: by page, then top to bottom, then oldest first. */
export async function listHighlights(docId: DocId): Promise<Highlight[]> {
  const items = await (await getDB()).getAllFromIndex('highlights', 'docId', docId);
  const top = (h: Highlight) => h.rects[0]?.y ?? 0;
  return items.sort((a, b) => a.page - b.page || top(a) - top(b) || a.createdAt - b.createdAt);
}

export async function putHighlight(highlight: Highlight): Promise<void> {
  await (await getDB()).put('highlights', highlight);
}

export async function deleteHighlight(id: string): Promise<void> {
  await (await getDB()).delete('highlights', id);
}

// ----------------------------------------------------------------- settings

export async function getSettings(): Promise<AppSettings> {
  const stored = await (await getDB()).get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function putSettings(settings: AppSettings): Promise<void> {
  await (await getDB()).put('settings', settings, 'app');
}
