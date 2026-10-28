import { progressPercent } from '@/features/library/libraryUtils';
import type { LibraryDocument, ReadingState } from '@/lib/types';
import { type ChapterSegment, chapterSegments, type DeskMeta, sectionAt, segmentIndexAt } from './deskMeta';

export interface BookProgress {
  page: number;
  pageCount: number;
  /** Pages read so far, fractional (page − 1 + offset). */
  position: number;
  percent: number;
  opened: boolean;
  finished: boolean;
  /** Chapter ranges; a single untitled segment when the chapters aren't known. */
  segments: ChapterSegment[];
  current: number;
  hasChapters: boolean;
  chapterTitle: string | null;
  /** 1-based number of the current chapter among real chapters (front matter excluded). */
  chapterNumber: number | null;
  chapterCount: number;
  /** The deepest outline entry at the current page, when it differs from the chapter. */
  sectionTitle: string | null;
  /** Pages left in the current chapter, fractional. */
  chapterPagesLeft: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Importing stamps lastOpenedAt = addedAt, so a book counts as opened once it has been read. */
export function isOpened(
  doc: Pick<LibraryDocument, 'lastOpenedAt' | 'addedAt'>,
  reading: Pick<ReadingState, 'location'> | undefined,
): boolean {
  return reading !== undefined || doc.lastOpenedAt > doc.addedAt;
}

export function bookProgress(
  doc: Pick<LibraryDocument, 'pageCount' | 'lastOpenedAt' | 'addedAt'>,
  reading: Pick<ReadingState, 'location'> | undefined,
  meta: DeskMeta | null,
): BookProgress {
  const pageCount = Math.max(0, doc.pageCount || meta?.pageCount || 0);
  const location = reading?.location ?? { page: 1, offset: 0 };
  const page = Math.max(1, Math.min(pageCount || 1, Math.floor(location.page) || 1));
  const offset = clamp01(location.offset || 0);
  const position = page - 1 + offset;
  const percent = progressPercent(pageCount, reading?.location);
  const chapters = meta?.chapters ?? [];
  const segments = chapterSegments(chapters, pageCount);
  const current = segmentIndexAt(segments, page);
  const hasChapters = chapters.length > 0;
  const segment = segments[current];
  const real = segments.filter((s) => !s.front);
  const chapterTitle = hasChapters && segment ? segment.title : null;
  const chapterNumber = hasChapters && segment && !segment.front ? real.indexOf(segment) + 1 : null;
  const section = meta ? sectionAt(meta.sections, page) : null;
  const sectionTitle =
    section && section.title !== chapterTitle && section.page >= (segment?.start ?? 1) ? section.title : null;
  return {
    page,
    pageCount,
    position,
    percent,
    opened: isOpened(doc, reading),
    finished: percent >= 100,
    segments,
    current,
    hasChapters,
    chapterTitle,
    chapterNumber,
    chapterCount: hasChapters ? real.length : 0,
    sectionTitle,
    chapterPagesLeft: segment ? Math.max(0, segment.end - position) : 0,
  };
}

/** How much of `segment` has been read, 0…1. */
export function segmentFill(segment: ChapterSegment, position: number): number {
  const length = segment.end - segment.start + 1;
  return clamp01((position - (segment.start - 1)) / length);
}
