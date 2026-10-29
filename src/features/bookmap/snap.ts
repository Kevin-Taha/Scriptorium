/**
 * Snapping on the book map. Each mark pulls the pointer when it comes close,
 * so a bookmark or note in a long book is easy to land on, but never so
 * strongly that it gets in the way:
 *
 * - Annotations within `GROUP_SPAN` px of each other are one target (the rail
 *   can't show them apart); a click lands on the first of them.
 * - A target pulls from `min(MAX_PULL, gap / 4)` px beyond its extent, where
 *   `gap` is the distance to the nearest other target. Pulls therefore never
 *   cover more than half of the stretch between two marks, and the pages in
 *   between stay reachable.
 * - A pull under `MIN_PULL` px is dropped: in crowded stretches the map
 *   behaves exactly as if there were no snapping, instead of flickering
 *   between snapped and unsnapped every pixel.
 */
import type { Bookmark, Highlight, MarginNote } from '@/lib/types';
import { type AnnotationItem, buildAnnotations } from '../notes/annotations';
import { fractionOf } from './geometry';

export const GROUP_SPAN = 3;
export const MAX_PULL = 6;
const MIN_PULL = 2;

/** A note (with its highlight), a highlight without a note, or a bookmark. */
export type MapItem =
  | AnnotationItem
  | { kind: 'bookmark'; id: string; page: number; y: 0; createdAt: number; bookmark: Bookmark };

/** Everything worth landing on, in reading order; a bookmark comes first on its page. */
export function mapItems(
  notes: readonly MarginNote[],
  highlights: readonly Highlight[],
  bookmarks: readonly Bookmark[],
): MapItem[] {
  const items: MapItem[] = bookmarks.map((bookmark) => ({
    kind: 'bookmark',
    id: bookmark.id,
    page: bookmark.page,
    y: 0,
    createdAt: bookmark.createdAt,
    bookmark,
  }));
  items.push(...buildAnnotations(notes, highlights));
  const rank = (item: MapItem) => (item.kind === 'bookmark' ? 0 : 1);
  return items.sort((a, b) => a.page - b.page || a.y - b.y || rank(a) - rank(b) || a.createdAt - b.createdAt);
}

export interface SnapTarget {
  /** Track px of the first and the last item. */
  top: number;
  bottom: number;
  /** How far beyond `top`…`bottom` the target pulls the pointer (px); 0 when it doesn't. */
  pull: number;
  /** In reading order; a click lands on the first. */
  items: MapItem[];
}

/** Groups `items` (in reading order) into targets on a track `height` px tall and sizes their pull. */
export function snapTargets(items: readonly MapItem[], pageCount: number, height: number): SnapTarget[] {
  if (height <= 0 || pageCount <= 0) return [];
  const targets: SnapTarget[] = [];
  let current: SnapTarget | null = null;
  for (const item of items) {
    const y = fractionOf({ page: item.page, offset: item.y }, pageCount) * height;
    if (current && y - current.top <= GROUP_SPAN) {
      current.bottom = y;
      current.items.push(item);
    } else {
      current = { top: y, bottom: y, pull: 0, items: [item] };
      targets.push(current);
    }
  }
  for (let i = 0; i < targets.length; i++) {
    const above = i > 0 ? targets[i].top - targets[i - 1].bottom : Number.POSITIVE_INFINITY;
    const below = i < targets.length - 1 ? targets[i + 1].top - targets[i].bottom : Number.POSITIVE_INFINITY;
    const pull = Math.min(MAX_PULL, Math.min(above, below) / 4);
    targets[i].pull = pull >= MIN_PULL ? pull : 0;
  }
  return targets;
}

/** The target pulling a pointer at track px `y`, if any. */
export function snapAt(targets: readonly SnapTarget[], y: number): SnapTarget | null {
  // The last target starting at or above y, and the one after it, are the only candidates.
  let lo = 0;
  let hi = targets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (targets[mid].top <= y) lo = mid + 1;
    else hi = mid;
  }
  for (const target of [targets[lo - 1], targets[lo]]) {
    if (!target || target.pull === 0) continue;
    const distance = y < target.top ? target.top - y : y > target.bottom ? y - target.bottom : 0;
    if (distance <= target.pull) return target;
  }
  return null;
}
