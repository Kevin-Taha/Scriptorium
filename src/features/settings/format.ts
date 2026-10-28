import type { LibraryBackup, RestoreSummary } from '@/lib/sync/backup';
import type { BookInfo } from '@/lib/sync/bookFile';
import { formatBytes, formatRelativeTime } from '@/lib/util';

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function quoted(name: string): string {
  return `“${name}”`;
}

/** Relative time that never reads "in 2 minutes" when the clock tick is a moment behind the data. */
export function relativeTime(timestamp: number, now: number): string {
  return formatRelativeTime(timestamp, Math.max(now, timestamp));
}

/** "Chrome on macOS · yesterday" */
export function describeDeviceActivity(device: { name: string; lastWriteAt: number }, now: number): string {
  return `${device.name} · ${relativeTime(device.lastWriteAt, now)}`;
}

/** "Using 412 MB", or null when the browser doesn't report usage. */
export function describeUsage(bytes: number | undefined): string | null {
  return bytes && bytes > 0 ? `Using ${formatBytes(bytes)}` : null;
}

export interface BackupCounts {
  books: number;
  notes: number;
  highlights: number;
  bookmarks: number;
}

export function countBackup(backup: LibraryBackup): BackupCounts {
  const counts: BackupCounts = { books: backup.books.length, notes: 0, highlights: 0, bookmarks: 0 };
  for (const { data } of backup.books) {
    counts.notes += data.notes.length;
    counts.highlights += data.highlights.length;
    counts.bookmarks += data.bookmarks.length;
  }
  return counts;
}

/** "12 books, 340 notes, 58 highlights": parts with nothing in them are left out. */
export function describeBackupCounts({ books, notes, highlights, bookmarks }: BackupCounts): string {
  const parts = [plural(books, 'book')];
  if (notes) parts.push(plural(notes, 'note'));
  if (highlights) parts.push(plural(highlights, 'highlight'));
  if (bookmarks) parts.push(plural(bookmarks, 'bookmark'));
  return parts.join(', ');
}

export function bookLabel(book: BookInfo): string {
  return book.title.trim() || book.fileName || 'Untitled book';
}

export interface RestoreOutcome {
  message: string;
  /** Books whose notes arrived but whose PDF isn't in the library yet. */
  missing: BookInfo[];
}

export function describeRestore(summary: RestoreSummary): RestoreOutcome {
  if (summary.books === 0) return { message: 'That backup doesn’t contain any books.', missing: [] };
  const message =
    summary.updated > 0
      ? `Restored notes for ${plural(summary.updated, 'book')}.`
      : 'Nothing new in that backup — your library already has it all.';
  return { message, missing: summary.missing };
}
