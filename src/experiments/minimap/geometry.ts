/**
 * Pure mapping math for the book minimap. The rail maps the whole book onto
 * its height linearly by page: a location's "fraction" is
 * `(page - 1 + offset) / pageCount`, so every page gets the same slice of the
 * rail whatever its printed size.
 */
import type { Bookmark, Highlight, MarginNote, NoteColor, OutlineItem, ReadingLocation } from '@/lib/types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  location: ReadingLocation;
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
 * The book's top-level divisions as rail bands, sorted and de-duplicated by
 * start page. When the outline wraps everything in one root entry (often the
 * book title), its children are used instead.
 */
export function railChapters(outline: OutlineItem[], pageCount: number): RailChapter[] {
  if (pageCount <= 0) return [];
  let level = outline;
  for (let depth = 0; depth < 3; depth++) {
    const resolved = level.filter((item) => item.location);
    if (resolved.length > 1 || level.length !== 1 || level[0].children.length === 0) break;
    level = level[0].children;
  }
  const starts = level
    .filter((item) => item.location && item.location.page >= 1 && item.location.page <= pageCount)
    .map((item) => ({ title: item.title, location: item.location! }))
    .sort((a, b) => a.location.page - b.location.page);
  const chapters: RailChapter[] = [];
  for (const start of starts) {
    if (chapters.at(-1)?.startPage === start.location.page) continue;
    chapters.push({
      title: start.title,
      label: chapterLabel(start.title),
      startPage: start.location.page,
      endPage: pageCount + 1,
      location: start.location,
    });
  }
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

export interface MarkInput {
  kind: MarkKind;
  fraction: number;
  color?: NoteColor;
}

export interface RailMark {
  kind: MarkKind;
  /** Pixels from the top of the track. */
  y: number;
  color?: NoteColor;
  /** How many annotations were merged into this mark. */
  count: number;
}

/** Every annotation of the book as a point along it. */
export function markInputs(
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  bookmarks: readonly Bookmark[],
  pageCount: number,
): MarkInput[] {
  const at = (page: number, offset: number) => fractionOf({ page, offset }, pageCount);
  return [
    ...bookmarks.map((b): MarkInput => ({ kind: 'bookmark', fraction: at(b.page, 0) })),
    ...highlights.map(
      (h): MarkInput => ({
        kind: 'highlight',
        fraction: at(h.page, h.rects.length ? Math.min(...h.rects.map((r) => r.y + r.h / 2)) : 0),
        color: h.color,
      }),
    ),
    ...notes.map((n): MarkInput => ({ kind: 'note', fraction: at(n.page, n.y), color: n.color })),
  ];
}

/**
 * Places marks on a track `height` px tall, merging marks of the same kind
 * that would land within `bucket` px of each other — a thousand-page book
 * with hundreds of notes still draws only a few hundred shapes.
 */
export function layoutMarks(inputs: readonly MarkInput[], height: number, bucket = 3): RailMark[] {
  if (height <= 0) return [];
  const merged = new Map<string, RailMark>();
  for (const input of inputs) {
    const y = clamp(input.fraction, 0, 1) * height;
    const key = `${input.kind}:${Math.round(y / bucket)}`;
    const existing = merged.get(key);
    if (existing) existing.count += 1;
    else merged.set(key, { kind: input.kind, y: Math.round(y * 2) / 2, color: input.color, count: 1 });
  }
  const order: Record<MarkKind, number> = { highlight: 0, note: 1, bookmark: 2 };
  return [...merged.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.y - b.y);
}

// ------------------------------------------------------------- page summary

export interface PageSummary {
  notes: NoteColor[];
  highlights: NoteColor[];
  bookmarked: boolean;
}

export function summarizePages(
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  bookmarks: readonly Bookmark[],
): Map<number, PageSummary> {
  const pages = new Map<number, PageSummary>();
  const entry = (page: number) => {
    let summary = pages.get(page);
    if (!summary) {
      summary = { notes: [], highlights: [], bookmarked: false };
      pages.set(page, summary);
    }
    return summary;
  };
  for (const note of notes) entry(note.page).notes.push(note.color);
  for (const highlight of highlights) entry(highlight.page).highlights.push(highlight.color);
  for (const bookmark of bookmarks) entry(bookmark.page).bookmarked = true;
  return pages;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "2 notes · 1 highlight · bookmarked", or "" for a page with nothing on it. */
export function describeSummary(summary: PageSummary | undefined): string {
  if (!summary) return '';
  const parts: string[] = [];
  if (summary.notes.length) parts.push(plural(summary.notes.length, 'note'));
  if (summary.highlights.length) parts.push(plural(summary.highlights.length, 'highlight'));
  if (summary.bookmarked) parts.push('bookmarked');
  return parts.join(' · ');
}

// ------------------------------------------------------------ reading trail

/** Merges ascending pages into inclusive runs: [1,2,3,7,8] → [[1,3],[7,8]]. */
export function pageRuns(pages: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const page of pages) {
    const last = runs.at(-1);
    if (last && page <= last[1] + 1) last[1] = Math.max(last[1], page);
    else runs.push([page, page]);
  }
  return runs;
}

// --------------------------------------------------------------------- thumb

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
