import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { OutlineItem, ReadingLocation } from '../types';
import { clamp } from '../util';

type RefProxy = { num: number; gen: number };
type ExplicitDest = [RefProxy | number, { name: string }, ...(number | null)[]];

/**
 * Resolves a PDF destination (named string or explicit array) to a reading
 * location. For `XYZ`/`FitH`/`FitBH` destinations the vertical target is
 * preserved so jumps land on the referenced figure, not just the page top.
 */
export async function resolveDestination(
  pdf: PDFDocumentProxy,
  dest: string | unknown[] | null | undefined,
): Promise<ReadingLocation | null> {
  try {
    const explicit = (
      typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    ) as ExplicitDest | null;
    if (!Array.isArray(explicit) || explicit.length < 2) return null;
    const [target, mode, ...args] = explicit;
    const pageIndex = typeof target === 'number' ? target : await pdf.getPageIndex(target as RefProxy);
    const page = pageIndex + 1;
    if (page < 1 || page > pdf.numPages) return null;

    let top: number | null = null;
    switch (mode?.name) {
      case 'XYZ':
        top = args[1] ?? null;
        break;
      case 'FitH':
      case 'FitBH':
        top = args[0] ?? null;
        break;
      case 'FitR':
        top = args[3] ?? null;
        break;
    }
    if (top === null) return { page, offset: 0 };

    const pdfPage = await pdf.getPage(page);
    const [, y0, , y1] = pdfPage.view;
    const height = y1 - y0;
    // PDF y grows upward; nudge a little above the target so the heading isn't flush with the edge.
    const offset = clamp((y1 - top) / height - 0.02, 0, 1);
    return { page, offset };
  } catch {
    return null;
  }
}

/** Reads the document outline and resolves every entry to a location. */
export async function loadOutline(pdf: PDFDocumentProxy): Promise<OutlineItem[]> {
  const raw = await pdf.getOutline();
  if (!raw) return [];
  type RawItem = (typeof raw)[number];
  const convert = async (items: RawItem[]): Promise<OutlineItem[]> =>
    Promise.all(
      items.map(async (item) => ({
        title: item.title,
        location: await resolveDestination(pdf, item.dest as string | unknown[] | null),
        children: await convert(item.items ?? []),
      })),
    );
  return convert(raw);
}

/** Flattens an outline depth-first, keeping only resolved entries. */
export function flattenOutline(items: OutlineItem[], depth = 0): (OutlineItem & { depth: number })[] {
  return items.flatMap((item) => [
    ...(item.location ? [{ ...item, depth }] : []),
    ...flattenOutline(item.children, depth + 1),
  ]);
}

export interface ChapterEntry {
  /** Trimmed and never empty. */
  title: string;
  location: ReadingLocation;
  /** The entry's own outline children: its sections. */
  children: OutlineItem[];
}

/**
 * The outline's chapter level, in page order with one entry per start page.
 * A lone root entry (usually the book title) is looked through, and an entry
 * without a destination or title (a "Part" heading) gives way to its children.
 * Starts outside `1…pageCount` are ignored when a page count is given.
 */
export function chapterEntries(outline: readonly OutlineItem[], pageCount = Infinity): ChapterEntry[] {
  let level = outline;
  while (level.length === 1 && level[0].children.length > 0) level = level[0].children;

  const found: ChapterEntry[] = [];
  const collect = (items: readonly OutlineItem[]) => {
    for (const item of items) {
      const title = item.title.trim();
      const page = item.location?.page ?? 0;
      if (item.location && title) {
        if (Number.isInteger(page) && page >= 1 && page <= pageCount)
          found.push({ title, location: item.location, children: item.children });
      } else {
        collect(item.children);
      }
    }
  };
  collect(level);
  return found
    .sort((a, b) => a.location.page - b.location.page)
    .filter((entry, i, all) => i === 0 || entry.location.page !== all[i - 1].location.page);
}

/**
 * Title of the deepest outline section containing `page`, e.g. to auto-label
 * bookmarks ("Chapter 3: Kinematics") or group notes in the review view.
 */
export function sectionForPage(outline: OutlineItem[], page: number): string | null {
  let best: { title: string; page: number; depth: number } | null = null;
  for (const item of flattenOutline(outline)) {
    const p = item.location!.page;
    if (p > page) continue;
    if (!best || p > best.page || (p === best.page && item.depth >= best.depth)) {
      best = { title: item.title, page: p, depth: item.depth };
    }
  }
  return best?.title ?? null;
}
