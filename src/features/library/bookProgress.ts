import { chapterEntries } from '@/lib/pdf/outline';
import type { ContentsEntry, LibraryDocument, OutlineItem, ReadingLocation } from '@/lib/types';
import { clamp } from '@/lib/util';
import { progressPercent } from './libraryUtils';

/** Entries kept per book; a longer outline keeps only its chapter level. */
export const MAX_CONTENTS = 500;
/** More chapters than this can't be drawn legibly, so the bar stays whole. */
export const MAX_SEGMENTS = 40;

/**
 * The part of an outline the library needs, resolved and in page order: chapters
 * (depth 0, one per page; see `chapterEntries`) with their sections (depth 1).
 */
export function contentsFromOutline(outline: OutlineItem[]): ContentsEntry[] {
  const entries = chapterEntries(outline).flatMap((chapter): ContentsEntry[] => [
    { title: chapter.title, page: chapter.location.page, depth: 0 },
    ...chapter.children.flatMap((section): ContentsEntry[] => {
      const title = section.title.trim();
      return section.location && title ? [{ title, page: section.location.page, depth: 1 }] : [];
    }),
  ]);
  entries.sort((a, b) => a.page - b.page);
  return entries.length > MAX_CONTENTS
    ? entries.filter((entry) => entry.depth === 0).slice(0, MAX_CONTENTS)
    : entries;
}

export function sameContents(saved: ContentsEntry[] | undefined, next: ContentsEntry[]): boolean {
  const current = saved ?? [];
  return (
    current.length === next.length &&
    current.every(
      (entry, i) =>
        entry.page === next[i].page && entry.depth === next[i].depth && entry.title === next[i].title,
    )
  );
}

/** A stretch of pages (a chapter, or the front matter) and how much of it has been read, 0…1. */
export interface Segment {
  start: number;
  end: number;
  fill: number;
}

export interface BookProgress {
  page: number;
  percent: number;
  /** Where in the contents you are; `number` is null before the first chapter. Null without contents. */
  chapter: { title: string; number: number | null; count: number } | null;
  section: string | null;
  /** One per chapter (plus any front matter), or a single one when there is nothing to split. */
  segments: Segment[];
}

export function bookProgress(
  doc: Pick<LibraryDocument, 'pageCount' | 'contents'>,
  location: ReadingLocation | undefined,
): BookProgress {
  const pageCount = Math.max(0, doc.pageCount);
  const page = clamp(Math.floor(location?.page ?? 1), 1, pageCount || Infinity);
  const position = page - 1 + clamp(location?.offset ?? 0, 0, 1);
  const contents = pageCount > 0 ? (doc.contents ?? []) : [];
  const chapters = contents.filter((entry) => entry.depth === 0);

  let chapterIndex = -1;
  let section: string | null = null;
  for (const entry of contents) {
    if (entry.page > page) break;
    if (entry.depth === 0) {
      chapterIndex++;
      section = null;
    } else {
      section = entry.title;
    }
  }

  const starts = chapters.length > MAX_SEGMENTS ? [] : chapters.map((chapter) => chapter.page);
  if (starts[0] !== 1) starts.unshift(1);
  const segments = starts.map((start, i) => {
    const end = Math.max(start, (starts[i + 1] ?? pageCount + 1) - 1);
    return {
      start,
      end,
      fill: pageCount > 0 ? clamp((position - (start - 1)) / (end - start + 1), 0, 1) : 0,
    };
  });

  const title = chapterIndex < 0 ? 'Front matter' : chapters[chapterIndex].title;
  return {
    page,
    percent: progressPercent(pageCount, location),
    chapter: chapters.length
      ? { title, number: chapterIndex < 0 ? null : chapterIndex + 1, count: chapters.length }
      : null,
    section: chapterIndex < 0 ? null : section,
    segments,
  };
}
