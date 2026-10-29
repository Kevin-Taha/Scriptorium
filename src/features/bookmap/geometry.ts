/**
 * Pure mapping math for the book map. The rail maps the whole book onto its
 * height linearly by page: a location's fraction is
 * `(page - 1 + offset) / pageCount`, so every page gets the same slice of the
 * rail whatever its printed size.
 */
import type { Bookmark, Highlight, MarginNote, NoteColor, OutlineItem, ReadingLocation } from '@/lib/types';
import { chapterEntries } from '@/lib/pdf/outline';
import { clamp } from '@/lib/util';
import { highlightAnchorY } from '../notes/highlightRects';

/** Position of a location along the book, 0 (first page top) … 1 (last page bottom). */
export function fractionOf(location: ReadingLocation, pageCount: number): number {
  if (pageCount <= 0) return 0;
  const page = clamp(Math.round(location.page) || 1, 1, pageCount);
  const offset = clamp(Number.isFinite(location.offset) ? location.offset : 0, 0, 1);
  return (page - 1 + offset) / pageCount;
}

/** Inverse of `fractionOf`: the location at a point along the book. */
export function locationAt(fraction: number, pageCount: number): ReadingLocation {
  const count = Math.max(1, pageCount);
  const x = clamp(Number.isFinite(fraction) ? fraction : 0, 0, 1) * count;
  const page = Math.min(count, Math.floor(x) + 1);
  return { page, offset: clamp(x - (page - 1), 0, 1) };
}

export function pageAt(fraction: number, pageCount: number): number {
  return locationAt(fraction, pageCount).page;
}

// ------------------------------------------------------------------ chapters

export interface RailChapter {
  title: string;
  /** Short tab label: "1", "12", "A", or "" when the title carries no number. */
  label: string;
  /** First page of the chapter. */
  startPage: number;
  /** First page after the chapter (exclusive). */
  endPage: number;
}

const NUMBERED =
  /^(?:chapter|ch\.?|part|unit|lecture|lesson|module|book|section)\s+([0-9]+|[ivxlcdm]+|[a-z])\b/i;
const APPENDIX = /^appendix\s+([a-z0-9]+)\b/i;
const LEADING_NUMBER = /^([0-9]+)(?:[.:)\s]|$)/;

/** "Chapter 3 Energy and Work" → "3", "Appendix A" → "A", "4. Momentum" → "4", "Preface" → "". */
export function chapterLabel(title: string): string {
  const text = title.trim();
  const numbered = NUMBERED.exec(text) ?? APPENDIX.exec(text) ?? LEADING_NUMBER.exec(text);
  return numbered ? numbered[1].toUpperCase() : '';
}

/**
 * The book's chapters as rail bands (see `chapterEntries`), each running to the
 * start of the next.
 */
export function railChapters(outline: readonly OutlineItem[], pageCount: number): RailChapter[] {
  if (pageCount <= 0) return [];
  const chapters = chapterEntries(outline, pageCount).map(
    (chapter): RailChapter => ({
      title: chapter.title,
      label: chapterLabel(chapter.title),
      startPage: chapter.location.page,
      endPage: pageCount + 1,
    }),
  );
  for (let i = 0; i < chapters.length - 1; i++) chapters[i].endPage = chapters[i + 1].startPage;
  return chapters;
}

/** Index of the chapter containing `page`, or -1 before the first chapter. */
export function chapterIndexAt(chapters: readonly RailChapter[], page: number): number {
  let index = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].startPage <= page) index = i;
    else break;
  }
  return index;
}

/**
 * Where a keyboard step on the rail moves its cursor (`null` for keys it
 * ignores). Up/Left and Down/Right step a page (ten with Shift), PageUp and
 * PageDown step a chapter, Home/End go to the ends of the book.
 */
export function keyboardStep(
  key: string,
  shift: boolean,
  page: number,
  pageCount: number,
  chapters: readonly RailChapter[],
): number | null {
  const last = Math.max(1, pageCount);
  const step = shift ? 10 : 1;
  switch (key) {
    case 'ArrowUp':
    case 'ArrowLeft':
      return clamp(page - step, 1, last);
    case 'ArrowDown':
    case 'ArrowRight':
      return clamp(page + step, 1, last);
    case 'Home':
      return 1;
    case 'End':
      return last;
    case 'PageDown': {
      const next = chapters.find((c) => c.startPage > page);
      return next ? next.startPage : last;
    }
    case 'PageUp': {
      const previous = chapters.findLast((c) => c.startPage < page);
      return previous ? previous.startPage : 1;
    }
    default:
      return null;
  }
}

// --------------------------------------------------------------------- marks

export type MarkKind = 'note' | 'highlight' | 'bookmark';

export interface RailMark {
  /** Unique per drawn shape. */
  key: string;
  kind: MarkKind;
  /** Pixels from the top of the track. */
  y: number;
  color?: NoteColor;
}

interface MarkInput {
  kind: MarkKind;
  fraction: number;
  color?: NoteColor;
}

const PAINT_ORDER: Record<MarkKind, number> = { highlight: 0, note: 1, bookmark: 2 };

/**
 * Every annotation as a shape on a track `height` px tall. Marks of the same
 * kind that would land within `bucket` px of each other are drawn once, so a
 * thousand-page book with hundreds of notes still draws a few hundred shapes.
 * Highlights paint first, bookmarks last.
 */
export function layoutMarks(
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  bookmarks: readonly Bookmark[],
  pageCount: number,
  height: number,
  bucket = 3,
): RailMark[] {
  if (height <= 0 || pageCount <= 0) return [];
  const at = (page: number, offset: number) => fractionOf({ page, offset }, pageCount);
  const inputs: MarkInput[] = [
    ...highlights.map(
      (h): MarkInput => ({
        kind: 'highlight',
        fraction: at(h.page, highlightAnchorY(h)),
        color: h.color,
      }),
    ),
    ...notes.map((n): MarkInput => ({ kind: 'note', fraction: at(n.page, n.y), color: n.color })),
    ...bookmarks.map((b): MarkInput => ({ kind: 'bookmark', fraction: at(b.page, 0) })),
  ];
  const merged = new Map<string, RailMark>();
  for (const input of inputs) {
    const y = input.fraction * height;
    const key = `${input.kind}:${Math.round(y / bucket)}`;
    if (!merged.has(key)) merged.set(key, { key, kind: input.kind, y: roundHalf(y), color: input.color });
  }
  return [...merged.values()].sort((a, b) => PAINT_ORDER[a.kind] - PAINT_ORDER[b.kind] || a.y - b.y);
}

/** True when two layouts draw the same shapes (so the map need not repaint while a note is typed). */
export function sameMarks(a: readonly RailMark[], b: readonly RailMark[]): boolean {
  return (
    a === b ||
    (a.length === b.length &&
      a.every((mark, i) => mark.kind === b[i].kind && mark.y === b[i].y && mark.color === b[i].color))
  );
}

export function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

// ------------------------------------------------------------- page summary

export interface PageSummary {
  notes: NoteColor[];
  highlights: NoteColor[];
  bookmarked: boolean;
}

/** The colours of the notes and highlights on `page`, and whether it is bookmarked. */
export function summarizePage(
  page: number,
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  bookmarks: readonly Bookmark[],
): PageSummary {
  return {
    notes: notes.flatMap((note) => (note.page === page ? [note.color] : [])),
    highlights: highlights.flatMap((highlight) => (highlight.page === page ? [highlight.color] : [])),
    bookmarked: bookmarks.some((bookmark) => bookmark.page === page),
  };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "2 notes, 1 highlight, bookmarked", or "" for a page with nothing on it. */
export function describeSummary(summary: PageSummary): string {
  const parts: string[] = [];
  if (summary.notes.length) parts.push(plural(summary.notes.length, 'note'));
  if (summary.highlights.length) parts.push(plural(summary.highlights.length, 'highlight'));
  if (summary.bookmarked) parts.push('bookmarked');
  return parts.join(', ');
}

// ----------------------------------------------------------- window and card

/**
 * The viewport window on a track `height` px tall, from the fractions at the
 * viewport's top and bottom edges. Too-small windows grow to `minHeight`
 * around their centre; the box always stays on the track.
 */
export function thumbBox(
  top: number,
  bottom: number,
  height: number,
  minHeight: number,
): { y: number; height: number } {
  if (height <= 0) return { y: 0, height: 0 };
  const start = clamp(top, 0, 1) * height;
  const end = clamp(Math.max(top, bottom), 0, 1) * height;
  const size = Math.min(height, Math.max(minHeight, end - start));
  const y = clamp((start + end) / 2 - size / 2, 0, height - size);
  return { y, height: size };
}

/** Top of a floating card of `cardHeight` centred on `y`, kept `inset` px inside a box `height` px tall. */
export function placeCard(y: number, cardHeight: number, height: number, inset = 8): number {
  const max = Math.max(inset, height - cardHeight - inset);
  return clamp(y - cardHeight / 2, inset, max);
}
