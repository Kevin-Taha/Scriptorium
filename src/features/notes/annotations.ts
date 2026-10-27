import type { Highlight, MarginNote, NoteColor } from '@/lib/types';
import { highlightAnchorY } from './highlightRects';

/**
 * One entry in a book-wide listing (sidebar, review, export): a margin note
 * (with the highlight it was written for, if any) or a highlight that has no
 * note. A highlight with a note is shown through that note, never twice.
 */
export type AnnotationItem =
  | {
      kind: 'note';
      id: string;
      page: number;
      /** Vertical position as a fraction of the page height. */
      y: number;
      createdAt: number;
      note: MarginNote;
      highlight?: Highlight;
    }
  | {
      kind: 'highlight';
      id: string;
      page: number;
      y: number;
      createdAt: number;
      highlight: Highlight;
    };

const byPosition = (a: AnnotationItem, b: AnnotationItem) =>
  a.page - b.page || a.y - b.y || a.createdAt - b.createdAt;

/** Notes and the highlights nothing links to, in reading order (page, then top to bottom). */
export function buildAnnotations(
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
): AnnotationItem[] {
  const byId = new Map(highlights.map((h) => [h.id, h]));
  const covered = new Set<string>();
  const items: AnnotationItem[] = [];

  for (const note of notes) {
    const highlight = note.highlightId ? byId.get(note.highlightId) : undefined;
    if (highlight) covered.add(highlight.id);
    items.push({
      kind: 'note',
      id: note.id,
      page: note.page,
      y: note.y,
      createdAt: note.createdAt,
      note,
      highlight,
    });
  }
  for (const highlight of highlights) {
    if (covered.has(highlight.id)) continue;
    items.push({
      kind: 'highlight',
      id: highlight.id,
      page: highlight.page,
      y: highlightAnchorY(highlight),
      createdAt: highlight.createdAt,
      highlight,
    });
  }
  return items.sort(byPosition);
}

/** Groups items (already in reading order) by page, pages ascending. */
export function groupAnnotationsByPage(
  items: readonly AnnotationItem[],
): { page: number; items: AnnotationItem[] }[] {
  const groups: { page: number; items: AnnotationItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.page === item.page) last.items.push(item);
    else groups.push({ page: item.page, items: [item] });
  }
  return groups;
}

/** The colours an item carries: a note's, plus its highlight's when that differs. */
export function annotationColors(item: AnnotationItem): NoteColor[] {
  if (item.kind === 'highlight') return [item.highlight.color];
  const colors = [item.note.color];
  if (item.highlight && item.highlight.color !== item.note.color) colors.push(item.highlight.color);
  return colors;
}

/** True when both lists hold the same underlying notes and highlights in the same order. */
export function sameAnnotations(a: readonly AnnotationItem[], b: readonly AnnotationItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, i) => {
    const other = b[i];
    if (item.kind !== other.kind) return false;
    if (item.kind === 'highlight') return item.highlight === (other as typeof item).highlight;
    const note = other as typeof item;
    return item.note === note.note && item.highlight === note.highlight;
  });
}
