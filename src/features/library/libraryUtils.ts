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

export function formatOpened(timestamp: number, now = Date.now()): string {
  return `Opened ${formatRelativeTime(timestamp, now)}`;
}
