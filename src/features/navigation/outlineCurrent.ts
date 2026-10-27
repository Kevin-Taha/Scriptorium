import type { OutlineItem, ReadingLocation } from '@/lib/types';

export interface OutlineEntry {
  key: string;
  item: OutlineItem;
  depth: number;
  parentKey: string | null;
}

export function outlineEntries(
  items: OutlineItem[],
  parentKey: string | null = null,
  depth = 1,
): OutlineEntry[] {
  return items.flatMap((item, index) => {
    const key = parentKey === null ? String(index) : `${parentKey}.${index}`;
    return [{ key, item, depth, parentKey }, ...outlineEntries(item.children, key, depth + 1)];
  });
}

/** The latest page, then the nearest preceding offset on that page, preferring deeper ties. */
export function currentOutlineEntry(entries: OutlineEntry[], location: ReadingLocation): OutlineEntry | null {
  let best: OutlineEntry | null = null;
  for (const entry of entries) {
    const destination = entry.item.location;
    if (!destination || destination.page > location.page) continue;
    const previous = best?.item.location;
    if (!previous || destination.page > previous.page) {
      best = entry;
    } else if (destination.page === previous.page) {
      const limit = destination.page === location.page ? location.offset : 1;
      const before = destination.offset <= limit;
      const previousBefore = previous.offset <= limit;
      if (
        (before && !previousBefore) ||
        (before === previousBefore &&
          (before ? destination.offset > previous.offset : destination.offset < previous.offset)) ||
        (destination.offset === previous.offset && entry.depth >= best!.depth)
      ) {
        best = entry;
      }
    }
  }
  return best;
}

export function ancestorKeys(key: string): string[] {
  const parts = key.split('.');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('.'));
}
