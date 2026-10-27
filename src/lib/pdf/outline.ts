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
