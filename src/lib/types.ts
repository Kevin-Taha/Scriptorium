/**
 * Core domain types shared across features. Keep this file dependency-free so
 * it can be imported from anywhere (UI, storage, tests).
 */

/** Stable document identifier: the pdf.js fingerprint of the file. */
export type DocId = string;

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
}

export interface Bookmark {
  id: string;
  docId: DocId;
  page: number;
  label: string;
  createdAt: number;
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
  createdAt: number;
  updatedAt: number;
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
