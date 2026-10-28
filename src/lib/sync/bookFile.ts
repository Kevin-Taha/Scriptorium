import type { BookData } from '../storage/repository';
import {
  type AnnotationKind,
  type Bookmark,
  type DocId,
  type Highlight,
  type HighlightRect,
  type LibraryDocument,
  type MarginNote,
  NOTE_COLORS,
  type NoteColor,
  type ReadingState,
  type Tombstone,
  type ZoomMode,
} from '../types';

/**
 * The portable form of one book's annotations: what a device writes to the
 * linked folder (`.scriptorium/devices/<device>/<book>.json`) and what a
 * backup file holds per book. Parsing is defensive: files come from other
 * devices and older or newer versions of the app, so anything malformed is
 * dropped rather than allowed into the library.
 */

export const BOOK_FILE_FORMAT = 'scriptorium.book';
export const BOOK_FILE_VERSION = 1;

/** Enough about the book to show it before its PDF is available. */
export interface BookInfo {
  id: DocId;
  title: string;
  fileName: string;
  pageCount: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
}

export interface BookFile {
  format: typeof BOOK_FILE_FORMAT;
  version: number;
  book: BookInfo;
  device: DeviceInfo;
  writtenAt: number;
  data: BookData;
}

export function bookInfoOf(doc: Pick<LibraryDocument, 'id' | 'title' | 'fileName' | 'pageCount'>): BookInfo {
  return { id: doc.id, title: doc.title, fileName: doc.fileName, pageCount: doc.pageCount };
}

export function createBookFile(
  book: BookInfo,
  device: DeviceInfo,
  data: BookData,
  writtenAt = Date.now(),
): BookFile {
  return { format: BOOK_FILE_FORMAT, version: BOOK_FILE_VERSION, book, device, writtenAt, data };
}

// ------------------------------------------------------------------ parsing

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isColor = (v: unknown): v is NoteColor => NOTE_COLORS.includes(v as NoteColor);
const optionalString = (v: unknown): string | undefined => (isString(v) ? v : undefined);

function parseList<T>(value: unknown, parse: (item: Json) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const parsed = parse(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseNote(v: Json, docId: DocId): MarginNote | null {
  if (!isString(v.id) || !isNumber(v.page) || !isNumber(v.y) || !isString(v.text) || !isColor(v.color))
    return null;
  if (!isNumber(v.createdAt) || !isNumber(v.updatedAt)) return null;
  return {
    id: v.id,
    docId,
    page: v.page,
    y: v.y,
    text: v.text,
    quote: optionalString(v.quote),
    color: v.color,
    highlightId: optionalString(v.highlightId),
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

function parseRect(v: Json): HighlightRect | null {
  return isNumber(v.x) && isNumber(v.y) && isNumber(v.w) && isNumber(v.h)
    ? { x: v.x, y: v.y, w: v.w, h: v.h }
    : null;
}

function parseHighlight(v: Json, docId: DocId): Highlight | null {
  if (!isString(v.id) || !isNumber(v.page) || !isString(v.text) || !isColor(v.color)) return null;
  if (!isNumber(v.createdAt) || !isNumber(v.updatedAt)) return null;
  const rects = parseList(v.rects, parseRect);
  if (rects.length === 0) return null;
  return {
    id: v.id,
    docId,
    page: v.page,
    rects,
    text: v.text,
    color: v.color,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

function parseBookmark(v: Json, docId: DocId): Bookmark | null {
  if (!isString(v.id) || !isNumber(v.page) || !isString(v.label) || !isNumber(v.createdAt)) return null;
  return {
    id: v.id,
    docId,
    page: v.page,
    label: v.label,
    createdAt: v.createdAt,
    updatedAt: isNumber(v.updatedAt) ? v.updatedAt : undefined,
  };
}

const KINDS: readonly AnnotationKind[] = ['note', 'highlight', 'bookmark'];

function parseTombstone(v: Json, docId: DocId): Tombstone | null {
  if (!isString(v.id) || !KINDS.includes(v.kind as AnnotationKind) || !isNumber(v.deletedAt)) return null;
  return { id: v.id, kind: v.kind as AnnotationKind, docId, deletedAt: v.deletedAt };
}

const ZOOM_MODES: readonly ZoomMode[] = ['fit-width', 'fit-page', 'custom'];

function parseProgress(v: unknown, docId: DocId): ReadingState | undefined {
  if (!isObject(v) || !isObject(v.location) || !isObject(v.zoom) || !isNumber(v.updatedAt)) return undefined;
  const { location, zoom } = v;
  if (!isNumber(location.page) || !isNumber(location.offset)) return undefined;
  if (!ZOOM_MODES.includes(zoom.mode as ZoomMode) || !isNumber(zoom.scale)) return undefined;
  return {
    docId,
    location: { page: location.page, offset: location.offset },
    zoom: { mode: zoom.mode as ZoomMode, scale: zoom.scale },
    updatedAt: v.updatedAt,
    deviceId: optionalString(v.deviceId),
  };
}

/** Validates annotation data for `docId`; record `docId`s are forced to the book's id. */
export function parseBookData(value: unknown, docId: DocId): BookData {
  const v = isObject(value) ? value : {};
  return {
    notes: parseList(v.notes, (n) => parseNote(n, docId)),
    highlights: parseList(v.highlights, (h) => parseHighlight(h, docId)),
    bookmarks: parseList(v.bookmarks, (b) => parseBookmark(b, docId)),
    tombstones: parseList(v.tombstones, (t) => parseTombstone(t, docId)),
    progress: parseProgress(v.progress, docId),
  };
}

/**
 * Book ids are content hashes: SHA-256 hex normally, or a shorter fallback hash
 * on insecure origins (see `contentHash`). Anything else — including path-like
 * strings — is rejected.
 */
const BOOK_ID = /^[A-Za-z0-9-]{8,128}$/;

export function parseBookInfo(value: unknown): BookInfo | null {
  if (!isObject(value) || !isString(value.id) || !BOOK_ID.test(value.id)) return null;
  return {
    id: value.id,
    title: isString(value.title) ? value.title : 'Untitled',
    fileName: isString(value.fileName) ? value.fileName : '',
    pageCount: isNumber(value.pageCount) ? value.pageCount : 0,
  };
}

/**
 * Parses a device's book file. Returns null for anything that isn't a book
 * file this version understands (wrong format, newer major version, bad id).
 */
export function parseBookFile(value: unknown): BookFile | null {
  if (!isObject(value) || value.format !== BOOK_FILE_FORMAT) return null;
  if (!isNumber(value.version) || value.version > BOOK_FILE_VERSION) return null;
  const book = parseBookInfo(value.book);
  if (!book) return null;
  const device = isObject(value.device) && isString(value.device.id) ? value.device : null;
  if (!device) return null;
  return {
    format: BOOK_FILE_FORMAT,
    version: value.version,
    book,
    device: { id: device.id as string, name: isString(device.name) ? device.name : 'Another device' },
    writtenAt: isNumber(value.writtenAt) ? value.writtenAt : 0,
    data: parseBookData(value.data, book.id),
  };
}
