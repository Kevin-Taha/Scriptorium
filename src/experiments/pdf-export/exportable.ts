import type { Highlight, MarginNote } from '@/lib/types';

/** Kept free of pdf-lib so the toolbar can use it without loading the exporter. */

export function validPage(page: number, pageCount: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}

export function validRect(rect: Highlight['rects'][number]): boolean {
  return (
    [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w > 0 &&
    rect.h > 0 &&
    rect.x + rect.w <= 1.00001 &&
    rect.y + rect.h <= 1.00001
  );
}

export function exportableData(
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  pageCount: number,
) {
  return {
    notes: notes.filter(
      (n) => validPage(n.page, pageCount) && Number.isFinite(n.y) && (!!n.text.trim() || !!n.quote?.trim()),
    ),
    highlights: highlights.filter((h) => validPage(h.page, pageCount) && h.rects.some(validRect)),
  };
}
