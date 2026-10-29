/**
 * Pure math for the book map. The rail maps the book linearly by page: a
 * location's fraction is `(page - 1 + offset) / pageCount`, so every page gets
 * the same slice of the rail whatever its printed size.
 */
import type { Bookmark, Highlight, MarginNote, NoteColor, ReadingLocation } from '@/lib/types';
import { clamp } from '@/lib/util';
import type { ChapterSpan } from '../navigation/chapterProgressModel';
import { type AnnotationItem, buildAnnotations } from '../notes/annotations';
import { highlightAnchorY } from '../notes/highlightRects';

export function fractionOf({ page, offset }: ReadingLocation, pageCount: number): number {
  return (clamp(page, 1, pageCount) - 1 + clamp(offset, 0, 1)) / pageCount;
}

export function locationAt(fraction: number, pageCount: number): ReadingLocation {
  const x = clamp(fraction, 0, 1) * pageCount;
  const page = Math.min(pageCount, Math.floor(x) + 1);
  return { page, offset: x - (page - 1) };
}

const CHAPTER_NUMBER = [
  /^(?:chapter|ch\.?|part|unit|lecture|lesson|module|book|section)\s+([0-9]+|[ivxlcdm]+|[a-z])\b/i,
  /^appendix\s+([a-z0-9]+)\b/i,
  /^([0-9]+)(?:[.:)\s]|$)/,
];

/** Thumb-index label: "Chapter 3 Energy" → "3", "Appendix A" → "A", "4. Momentum" → "4", "Preface" → "". */
export function chapterLabel(title: string): string {
  for (const pattern of CHAPTER_NUMBER) {
    const match = pattern.exec(title);
    if (match) return match[1].toUpperCase();
  }
  return '';
}

/** Arrows step a page (ten with Shift), PageUp/PageDown a chapter, Home/End to the ends; `null` for other keys. */
export function keyboardStep(
  key: string,
  shift: boolean,
  page: number,
  pageCount: number,
  chapters: readonly ChapterSpan[],
): number | null {
  const step = shift ? 10 : 1;
  switch (key) {
    case 'ArrowUp':
    case 'ArrowLeft':
      return Math.max(1, page - step);
    case 'ArrowDown':
    case 'ArrowRight':
      return Math.min(pageCount, page + step);
    case 'Home':
      return 1;
    case 'End':
      return pageCount;
    case 'PageDown':
      return chapters.find((c) => c.startPage > page)?.startPage ?? pageCount;
    case 'PageUp':
      return chapters.findLast((c) => c.startPage < page)?.startPage ?? 1;
    default:
      return null;
  }
}

export interface RailMark {
  key: string;
  kind: 'note' | 'highlight' | 'bookmark';
  /** Pixels from the top of the track. */
  y: number;
  color?: NoteColor;
}

/**
 * Every annotation as a shape on a track `height` px tall, highlights painted
 * first and bookmarks last. Same-kind marks within 3px are drawn once, so a
 * long book with hundreds of notes still draws a bounded number of shapes.
 */
export function layoutMarks(
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  bookmarks: readonly Bookmark[],
  pageCount: number,
  height: number,
): RailMark[] {
  const marks = new Map<string, RailMark>();
  const add = (kind: RailMark['kind'], page: number, offset: number, color?: NoteColor) => {
    const y = fractionOf({ page, offset }, pageCount) * height;
    const key = `${kind}:${Math.round(y / 3)}`;
    if (!marks.has(key)) marks.set(key, { key, kind, y: Math.round(y * 2) / 2, color });
  };
  for (const h of highlights) add('highlight', h.page, highlightAnchorY(h), h.color);
  for (const n of notes) add('note', n.page, n.y, n.color);
  for (const b of bookmarks) add('bookmark', b.page, 0);
  return [...marks.values()];
}

/** True when two layouts draw the same shapes (so the map doesn't repaint while a note is typed). */
export function sameMarks(a: readonly RailMark[], b: readonly RailMark[]): boolean {
  return (
    a === b ||
    (a.length === b.length &&
      a.every((m, i) => m.key === b[i].key && m.y === b[i].y && m.color === b[i].color))
  );
}

const count = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');

/** "2 notes, 1 highlight, bookmarked", or "" for a page with nothing on it. */
export function describePage(
  page: number,
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  bookmarks: readonly Bookmark[],
): string {
  return [
    count(notes.filter((n) => n.page === page).length, 'note'),
    count(highlights.filter((h) => h.page === page).length, 'highlight'),
    bookmarks.some((b) => b.page === page) ? 'bookmarked' : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** The viewport window on a track `height` px tall: at least `min` px, centred on the view, kept on the track. */
export function thumbBox(top: number, bottom: number, height: number, min: number) {
  const size = clamp((bottom - top) * height, min, height);
  return { y: clamp(((top + bottom) / 2) * height - size / 2, 0, height - size), height: size };
}

// ---------------------------------------------------------------- snapping

/** Annotations within this many px are one target: the rail can't show them apart. */
export const GROUP_SPAN = 3;
export const MAX_PULL = 6;
const MIN_PULL = 2;

/** A note (with its highlight), a highlight without a note, or a bookmark. */
export type MapItem =
  | AnnotationItem
  | { kind: 'bookmark'; id: string; page: number; y: 0; createdAt: number; bookmark: Bookmark };

/** Everything worth landing on, in reading order; a bookmark comes first on its page. */
export function mapItems(
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  bookmarks: readonly Bookmark[],
): MapItem[] {
  const items: MapItem[] = bookmarks.map((bookmark) => ({
    kind: 'bookmark',
    id: bookmark.id,
    page: bookmark.page,
    y: 0,
    createdAt: bookmark.createdAt,
    bookmark,
  }));
  items.push(...buildAnnotations(notes, highlights));
  const rank = (item: MapItem) => (item.kind === 'bookmark' ? 0 : 1);
  return items.sort((a, b) => a.page - b.page || a.y - b.y || rank(a) - rank(b) || a.createdAt - b.createdAt);
}

export interface SnapTarget {
  /** Track px of the first and last item. */
  top: number;
  bottom: number;
  /** How far beyond `top`…`bottom` the target catches the pointer (px); 0 when it doesn't. */
  pull: number;
  /** In reading order; a click lands on the first. */
  items: MapItem[];
}

/**
 * Groups `items` into targets and sizes each pull to `min(MAX_PULL, gap / 4)`,
 * `gap` being the distance to the nearest other target. Pulls so never cover
 * more than half the stretch between two marks, and pulls under `MIN_PULL` are
 * dropped: in crowded stretches the map behaves as if there were no snapping.
 */
export function snapTargets(items: readonly MapItem[], pageCount: number, height: number): SnapTarget[] {
  const targets: SnapTarget[] = [];
  for (const item of items) {
    const y = fractionOf({ page: item.page, offset: item.y }, pageCount) * height;
    const last = targets.at(-1);
    if (last && y - last.top <= GROUP_SPAN) {
      last.bottom = y;
      last.items.push(item);
    } else targets.push({ top: y, bottom: y, pull: 0, items: [item] });
  }
  targets.forEach((target, i) => {
    const above = i > 0 ? target.top - targets[i - 1].bottom : Number.POSITIVE_INFINITY;
    const below = i < targets.length - 1 ? targets[i + 1].top - target.bottom : Number.POSITIVE_INFINITY;
    const pull = Math.min(MAX_PULL, above / 4, below / 4);
    target.pull = pull >= MIN_PULL ? pull : 0;
  });
  return targets;
}

/** The target catching a pointer at track px `y`, if any (pulls never overlap). */
export function snapAt(targets: readonly SnapTarget[], y: number): SnapTarget | null {
  return targets.find((t) => t.pull > 0 && y >= t.top - t.pull && y <= t.bottom + t.pull) ?? null;
}
