import type { OutlineItem, ReadingLocation } from '@/lib/types';

/** A page interval [startPage, endPage), with one-based PDF page numbers. */
export interface ChapterSpan {
  title: string;
  startPage: number;
  endPage: number;
  location: ReadingLocation;
}

export function buildChapterSpans(outline: readonly OutlineItem[], pageCount: number): ChapterSpan[] {
  const count = Math.max(0, Math.floor(pageCount));
  if (!count) return [];
  const starts = outline
    .filter(
      (item): item is OutlineItem & { location: ReadingLocation } =>
        item.location !== null &&
        Number.isInteger(item.location.page) &&
        item.location.page >= 1 &&
        item.location.page <= count,
    )
    .slice()
    .sort((a, b) => a.location.page - b.location.page)
    .filter((item, index, items) => index === 0 || item.location.page !== items[index - 1].location.page);

  if (!starts.length) {
    return [{ title: 'Book', startPage: 1, endPage: count + 1, location: { page: 1, offset: 0 } }];
  }
  const spans: ChapterSpan[] = starts.map((item, index) => ({
    title: item.title || 'Untitled chapter',
    startPage: item.location.page,
    endPage: starts[index + 1]?.location.page ?? count + 1,
    location: item.location,
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

function position(location: ReadingLocation): number {
  return location.page + Math.max(0, Math.min(1, location.offset));
}

export function findCurrentChapter(
  spans: readonly ChapterSpan[],
  location: ReadingLocation,
): ChapterSpan | null {
  if (!spans.length) return null;
  const pos = position(location);
  return (
    spans.find((span) => pos >= span.startPage && pos < span.endPage) ??
    (pos < spans[0].startPage ? spans[0] : spans[spans.length - 1])
  );
}

export function chapterProgress(span: ChapterSpan, location: ReadingLocation): number {
  return Math.max(0, Math.min(1, (position(location) - span.startPage) / (span.endPage - span.startPage)));
}

export function pagesLeft(span: ChapterSpan, location: ReadingLocation): number {
  return Math.max(0, span.endPage - Math.max(span.startPage, position(location)));
}

export function minutesLeft(span: ChapterSpan, location: ReadingLocation, secondsPerPage: number): number {
  return (pagesLeft(span, location) * Math.max(0, secondsPerPage)) / 60;
}

export function formatTimeLeft(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `≈ ${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `≈ ${hours} h${rest ? ` ${rest} min` : ''}`;
}
