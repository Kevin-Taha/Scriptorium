import type { BookData } from '../storage/repository';
import { getBookData, getDocument, listDocIdsWithData, listDocuments } from '../storage/repository';
import type { DocId } from '../types';
import { mergeIntoLibrary } from './apply';
import { type BookInfo, bookInfoOf, type DeviceInfo, parseBookData, parseBookInfo } from './bookFile';
import { getDevice } from './device';
import { isEmptyBookData } from './merge';

/**
 * Library backups: every book's notes, highlights, bookmarks and reading
 * progress in one JSON file. PDFs are not included; restoring merges the
 * annotations in, and books whose PDF isn't on this device pick their notes up
 * as soon as the same PDF is added (books are matched by content hash).
 */

export const BACKUP_FORMAT = 'scriptorium.backup';
export const BACKUP_VERSION = 1;

export interface LibraryBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  device: DeviceInfo;
  books: { book: BookInfo; data: BookData }[];
}

export async function buildBackup(now = Date.now()): Promise<LibraryBackup> {
  const docs = new Map((await listDocuments()).map((doc) => [doc.id, doc]));
  const ids = new Set<DocId>([...docs.keys(), ...(await listDocIdsWithData())]);
  const books: LibraryBackup['books'] = [];
  for (const id of [...ids].sort()) {
    const data = await getBookData(id);
    const doc = docs.get(id);
    if (!doc && isEmptyBookData(data)) continue;
    books.push({
      book: doc ? bookInfoOf(doc) : { id, title: 'Untitled', fileName: '', pageCount: 0 },
      data,
    });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    device: await getDevice(),
    books,
  };
}

export function backupFileName(exportedAt: number): string {
  const date = new Date(exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Scriptorium backup ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export class BackupFormatError extends Error {
  constructor(message = 'That file isn’t a Scriptorium backup.') {
    super(message);
    this.name = 'BackupFormatError';
  }
}

export interface RestoreSummary {
  /** Books in the backup. */
  books: number;
  /** Books whose data on this device changed. */
  updated: number;
  /** Books with annotations whose PDF isn't in this library yet. */
  missing: BookInfo[];
}

/** Validates a parsed backup file. Throws `BackupFormatError` for anything else. */
export function parseBackup(value: unknown): LibraryBackup {
  if (typeof value !== 'object' || value === null) throw new BackupFormatError();
  const v = value as Record<string, unknown>;
  if (v.format !== BACKUP_FORMAT) throw new BackupFormatError();
  if (typeof v.version !== 'number' || v.version > BACKUP_VERSION) {
    throw new BackupFormatError(
      'This backup was made by a newer version of Scriptorium. Update and try again.',
    );
  }
  if (!Array.isArray(v.books)) throw new BackupFormatError();
  const books: LibraryBackup['books'] = [];
  for (const entry of v.books) {
    const book = parseBookInfo((entry as Record<string, unknown> | null)?.book);
    if (!book) continue;
    books.push({ book, data: parseBookData((entry as Record<string, unknown>).data, book.id) });
  }
  const device = (v.device ?? {}) as Partial<DeviceInfo>;
  return {
    format: BACKUP_FORMAT,
    version: v.version,
    exportedAt: typeof v.exportedAt === 'number' ? v.exportedAt : 0,
    device: { id: String(device.id ?? ''), name: String(device.name ?? 'Unknown device') },
    books,
  };
}

/** Merges a backup into the library; nothing on this device is lost, newer edits win. */
export async function restoreBackup(backup: LibraryBackup): Promise<RestoreSummary> {
  let updated = 0;
  const missing: BookInfo[] = [];
  for (const { book, data } of backup.books) {
    if (await mergeIntoLibrary(book.id, [data])) updated++;
    if (!(await getDocument(book.id)) && !isEmptyBookData(data)) missing.push(book);
  }
  return { books: backup.books.length, updated, missing };
}

/** Reads, validates and restores a backup file chosen by the reader. */
export async function restoreBackupFile(file: Blob): Promise<RestoreSummary> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new BackupFormatError();
  }
  return restoreBackup(parseBackup(json));
}
