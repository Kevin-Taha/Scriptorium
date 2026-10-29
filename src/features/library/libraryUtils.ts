import type { ReadingLocation } from '@/lib/types';
import { clamp, formatRelativeTime } from '@/lib/util';

/** Rounded whole-book progress, reserving 100% for the end of the last page. */
export function progressPercent(pageCount: number, location?: ReadingLocation): number {
  if (
    !location ||
    !Number.isFinite(pageCount) ||
    pageCount <= 0 ||
    !Number.isFinite(location.page) ||
    !Number.isFinite(location.offset)
  )
    return 0;
  const page = clamp(Math.floor(location.page), 1, pageCount);
  const offset = clamp(location.offset, 0, 1);
  const progress = Math.round(((page - 1 + offset) / pageCount) * 100);
  return Math.min(page === pageCount && offset >= 0.95 ? 100 : 99, progress);
}

export interface AnnotationCounts {
  notes: number;
  highlights: number;
  bookmarks: number;
}

/** What the "Reset progress" dialog says will be lost, built from what the book really holds. */
export function describeReset(
  { notes, highlights, bookmarks }: AnnotationCounts,
  folderLinked: boolean,
): string {
  const lost = (
    [
      [notes, 'note'],
      [highlights, 'highlight'],
      [bookmarks, 'bookmark'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `${count} ${noun}${count === 1 ? '' : 's'}`);
  const list = lost.length > 1 ? `${lost.slice(0, -1).join(', ')} and ${lost.at(-1)}` : lost[0];
  const text = list
    ? `This returns you to the start and deletes ${list}. The book stays in your library. This can’t be undone.`
    : 'This returns you to the start of the book. It has no notes, highlights or bookmarks.';
  return folderLinked ? `${text} Other devices using this folder will see the reset too.` : text;
}

export function formatOpened(timestamp: number, now = Date.now()): string {
  return timestamp > 0 ? `Opened ${formatRelativeTime(timestamp, now)}` : 'Not opened yet';
}
