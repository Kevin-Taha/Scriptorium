/**
 * Core domain types shared across features. Keep this file dependency-free so
 * it can be imported from anywhere (UI, storage, tests).
 */

/** Stable document identifier: the SHA-256 hash of the PDF's bytes. */
export type DocId = string;

/**
 * Where a book's bytes live. Imported books are copied into browser storage;
 * folder books are read from the linked library folder at `path` (relative,
 * `/`-separated) and never copied.
 */
export type BookSource = { kind: 'imported' } | { kind: 'folder'; path: string; missing?: boolean };

export interface LibraryDocument {
  id: DocId;
  title: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  addedAt: number;
  lastOpenedAt: number;
  /** Small JPEG data URL of the first page, used as the library cover. */
  coverDataUrl?: string;
  /** Absent on books imported before folder sync existed, which are `imported`. */
  source?: BookSource;
}

/**
 * A position within a document.
 * `page` is 1-based. `offset` is the fraction (0..1) of that page's height that
 * sits at the top edge of the viewport.
 */
export interface ReadingLocation {
  page: number;
  offset: number;
}

export type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

export interface ZoomState {
  mode: ZoomMode;
  /** Effective scale; 1 renders one PDF point as one CSS pixel × 4/3 (i.e. 100%). */
  scale: number;
}

export interface ReadingState {
  docId: DocId;
  location: ReadingLocation;
  zoom: ZoomState;
  updatedAt: number;
  /** Device that saved this position; lets another device say where you left off. */
  deviceId?: string;
}

export interface Bookmark {
  id: string;
  docId: DocId;
  page: number;
  label: string;
  createdAt: number;
  /** Last edit (e.g. rename). Bookmarks saved before sync existed only have `createdAt`. */
  updatedAt?: number;
}

export const NOTE_COLORS = ['amber', 'sage', 'sky', 'rose', 'lavender'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface MarginNote {
  id: string;
  docId: DocId;
  page: number;
  /** Anchor position as a fraction (0..1) of the page height. */
  y: number;
  text: string;
  /** Text excerpt the note was created from, if any. */
  quote?: string;
  color: NoteColor;
  /** The highlight this note was written for, if any. Deleting the highlight clears the link. */
  highlightId?: string;
  createdAt: number;
  updatedAt: number;
}

/** A rectangle as fractions (0..1) of the page box, so it survives every zoom level. */
export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Coloured emphasis over a passage of text, drawn as one rectangle per line. */
export interface Highlight {
  id: string;
  docId: DocId;
  page: number;
  rects: HighlightRect[];
  /** The highlighted passage, whitespace-normalised. */
  text: string;
  color: NoteColor;
  createdAt: number;
  updatedAt: number;
}

export type AnnotationKind = 'note' | 'highlight' | 'bookmark';

/**
 * Record that an annotation was deleted. Kept so the deletion reaches other
 * devices instead of the annotation being resurrected from their copies.
 */
export interface Tombstone {
  id: string;
  kind: AnnotationKind;
  docId: DocId;
  deletedAt: number;
}

export type Theme = 'light' | 'sepia' | 'dark';

export interface AppSettings {
  theme: Theme;
  /** Invert page colours while the dark theme is active. */
  invertPagesInDark: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  invertPagesInDark: false,
};

export interface OutlineItem {
  title: string;
  /** Resolved destination, or null if the entry could not be resolved. */
  location: ReadingLocation | null;
  children: OutlineItem[];
}
