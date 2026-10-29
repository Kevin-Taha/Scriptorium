import { chapterEntries } from '@/lib/pdf/outline';
import type { OutlineItem, ReadingLocation } from '@/lib/types';

/** One-based, half-open page interval. */
export interface ChapterSpan {
  title: string;
  startPage: number;
  endPage: number;
  location: ReadingLocation;
}

export function buildChapterSpans(outline: readonly OutlineItem[], pageCount: number): ChapterSpan[] {
  const count = Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0;
  if (!count) return [];

  const starts = chapterEntries(outline, count);
  if (!starts.length) {
    return [{ title: 'Book', startPage: 1, endPage: count + 1, location: { page: 1, offset: 0 } }];
  }
  const spans = starts.map((entry, index) => ({
    title: entry.title,
    startPage: entry.location.page,
    endPage: starts[index + 1]?.location.page ?? count + 1,
    location: entry.location,
  }));
  if (spans[0].startPage > 1) {
    spans.unshift({
      title: 'Front matter',
      startPage: 1,
      endPage: spans[0].startPage,
      location: { page: 1, offset: 0 },
    });
  }
  return spans;
}

export function findCurrentChapter(spans: readonly ChapterSpan[], page: number): ChapterSpan | null {
  if (!spans.length) return null;
  return (
    spans.find((span) => page >= span.startPage && page < span.endPage) ??
    (page < spans[0].startPage ? spans[0] : spans[spans.length - 1])
  );
}

export function chapterProgress(span: ChapterSpan, page: number): number {
  return Math.max(0, Math.min(1, (page - span.startPage) / (span.endPage - span.startPage)));
}

export function pagesLeft(span: ChapterSpan, page: number): number {
  return Math.max(0, Math.min(span.endPage - span.startPage, span.endPage - 1 - page));
}

/** The segment a key moves the strip's focus to from `index` among `count` segments, or null for other keys. */
export function stepSegment(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, index - 1);
    case 'ArrowRight':
      return Math.min(count - 1, index + 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
