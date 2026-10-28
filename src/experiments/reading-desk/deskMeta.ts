import type { DocId, OutlineItem } from '@/lib/types';

/**
 * Per-book metadata the reading desk remembers while a book is open (the library
 * never loads PDFs, so it can't read outlines itself). Prototype data in
 * localStorage under `scriptorium.exp.reading-desk.meta.<docId>`.
 */
export interface DeskSection {
  title: string;
  page: number;
  depth: number;
}

export interface DeskChapter {
  title: string;
  page: number;
}

export interface DeskMeta {
  v: 1;
  pageCount: number;
  /** The book's chapter level (see `chapterLevel`), sorted by start page. */
  chapters: DeskChapter[];
  /** Every resolved outline entry, sorted by page, for naming the current section. */
  sections: DeskSection[];
  updatedAt: number;
}

export interface ChapterSegment {
  title: string;
  start: number;
  end: number;
  /** True for the pages before the first chapter (title page, contents, preface…). */
  front: boolean;
}

const KEY_PREFIX = 'scriptorium.exp.reading-desk.meta.';
const MAX_SECTIONS = 400;

export function metaKey(docId: DocId): string {
  return `${KEY_PREFIX}${docId}`;
}

export function loadMeta(docId: DocId): DeskMeta | null {
  try {
    const raw = localStorage.getItem(metaKey(docId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeskMeta;
    return parsed?.v === 1 && Array.isArray(parsed.chapters) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMeta(docId: DocId, meta: DeskMeta): void {
  try {
    localStorage.setItem(metaKey(docId), JSON.stringify(meta));
  } catch {
    // Storage full: the desk falls back to page-only progress.
  }
}

function resolved(items: OutlineItem[]): OutlineItem[] {
  return items.filter((item) => item.location);
}

/**
 * The outline level that reads as "chapters": the top level, unless it is a
 * single wrapper entry (often the book title), in which case its children.
 */
export function chapterLevel(outline: OutlineItem[]): DeskChapter[] {
  let level = outline;
  for (let guard = 0; guard < 4; guard++) {
    const withChildren = level.filter((item) => item.children.length > 0);
    if (level.length === 1 && withChildren.length === 1) level = level[0].children;
    else break;
  }
  const seen = new Set<number>();
  return resolved(level)
    .map((item) => ({ title: item.title.trim(), page: item.location!.page }))
    .sort((a, b) => a.page - b.page)
    .filter((chapter) => {
      if (seen.has(chapter.page)) return false;
      seen.add(chapter.page);
      return true;
    });
}

export function flattenSections(outline: OutlineItem[], depth = 0, out: DeskSection[] = []): DeskSection[] {
  for (const item of outline) {
    if (out.length >= MAX_SECTIONS) break;
    if (item.location) out.push({ title: item.title.trim(), page: item.location.page, depth });
    flattenSections(item.children, depth + 1, out);
  }
  return depth === 0 ? out.sort((a, b) => a.page - b.page || a.depth - b.depth) : out;
}

export function buildMeta(outline: OutlineItem[], pageCount: number, now = Date.now()): DeskMeta {
  return {
    v: 1,
    pageCount,
    chapters: chapterLevel(outline).filter((c) => c.page <= pageCount),
    sections: flattenSections(outline).filter((s) => s.page <= pageCount),
    updatedAt: now,
  };
}

/** Deepest, latest outline entry that starts on or before `page` (sections are sorted by page, then depth). */
export function sectionAt(sections: DeskSection[], page: number): DeskSection | null {
  let best: DeskSection | null = null;
  for (const section of sections) {
    if (section.page > page) break;
    best = section;
  }
  return best;
}

/** The book split into chapter ranges covering pages 1…pageCount. */
export function chapterSegments(chapters: DeskChapter[], pageCount: number): ChapterSegment[] {
  if (pageCount <= 0) return [];
  const valid = chapters.filter((c) => c.page >= 1 && c.page <= pageCount);
  if (!valid.length) return [{ title: '', start: 1, end: pageCount, front: false }];
  const out: ChapterSegment[] = [];
  if (valid[0].page > 1) out.push({ title: 'Front matter', start: 1, end: valid[0].page - 1, front: true });
  valid.forEach((chapter, i) => {
    const end = i < valid.length - 1 ? valid[i + 1].page - 1 : pageCount;
    out.push({ title: chapter.title, start: chapter.page, end: Math.max(chapter.page, end), front: false });
  });
  return out;
}

/** Index of the segment containing `page` (the last one when past the end). */
export function segmentIndexAt(segments: ChapterSegment[], page: number): number {
  for (let i = segments.length - 1; i >= 0; i--) if (segments[i].start <= page) return i;
  return 0;
}
