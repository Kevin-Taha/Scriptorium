import type { AnnotationItem } from './annotations';

/** The focused note or highlight, including a focused control within it. */
export function focusedItemId(): string | undefined {
  const element = document.activeElement?.closest<HTMLElement>('.review-note');
  return element?.dataset.noteId ?? element?.dataset.highlightId;
}

/** Moves through the complete filtered list, including items outside the rendered window. */
export function adjacentItem(
  items: readonly AnnotationItem[],
  currentId: string | undefined,
  direction: 1 | -1,
): AnnotationItem | undefined {
  if (items.length === 0) return undefined;
  const current = items.findIndex((item) => item.id === currentId);
  const index = current === -1 ? (direction === 1 ? 0 : items.length - 1) : current + direction;
  return items[Math.max(0, Math.min(items.length - 1, index))];
}

/** The item after (or, failing that, before) a deleted item. */
export function neighbourItem(items: readonly AnnotationItem[], id: string): AnnotationItem | undefined {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return undefined;
  return items[index + 1] ?? items[index - 1];
}
