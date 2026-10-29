import { chapterEntries } from '@/lib/pdf/outline';
import type { OutlineItem, ReadingLocation } from '@/lib/types';
import { clamp } from '@/lib/util';

/** One-based, half-open page interval. */
export interface ChapterSpan {
  title: string;
  startPage: number;
  endPage: number;
  location: ReadingLocation;
}

export function buildChapterSpans(outline: readonly OutlineItem[], pageCount: number): ChapterSpan[] {
  if (pageCount < 1) return [];

  const starts = chapterEntries(outline, pageCount);
  if (!starts.length) {
    return [{ title: 'Book', startPage: 1, endPage: pageCount + 1, location: { page: 1, offset: 0 } }];
  }
  const spans = starts.map((entry, index) => ({
    title: entry.title,
    startPage: entry.location.page,
    endPage: starts[index + 1]?.location.page ?? pageCount + 1,
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

/** The chapter holding `page`; the spans cover the whole book, so a stray page lands on the nearest end. */
export function findCurrentChapter(spans: readonly ChapterSpan[], page: number): ChapterSpan {
  return spans.findLast((span) => span.startPage <= page) ?? spans[0];
}

export function chapterProgress(span: ChapterSpan, page: number): number {
  return clamp((page - span.startPage) / (span.endPage - span.startPage), 0, 1);
}
