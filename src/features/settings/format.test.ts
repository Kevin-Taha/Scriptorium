import { describe, expect, it } from 'vitest';
import type { LibraryBackup } from '@/lib/sync/backup';
import {
  bookLabel,
  countBackup,
  describeBackupCounts,
  describeDeviceActivity,
  describeRestore,
  describeUsage,
  plural,
  quoted,
  relativeTime,
} from './format';

const NOW = Date.UTC(2026, 5, 1, 12);
const book = (title: string, fileName = '') => ({ id: 'a'.repeat(64), title, fileName, pageCount: 1 });

describe('settings text', () => {
  it('pluralises counts', () => {
    expect(plural(1, 'book')).toBe('1 book');
    expect(plural(12, 'book')).toBe('12 books');
    expect(plural(0, 'note')).toBe('0 notes');
  });

  it('quotes names with typographic quotes', () => {
    expect(quoted('Textbooks')).toBe('“Textbooks”');
  });

  it('formats relative times and never reads as the future', () => {
    expect(relativeTime(NOW - 2 * 60_000, NOW)).toBe('2 minutes ago');
    expect(relativeTime(NOW - 26 * 3600_000, NOW)).toBe('yesterday');
    expect(relativeTime(NOW + 10 * 60_000, NOW)).toBe('just now');
  });

  it('describes another device by name and last activity', () => {
    expect(describeDeviceActivity({ name: 'Chrome on macOS', lastWriteAt: NOW - 26 * 3600_000 }, NOW)).toBe(
      'Chrome on macOS · yesterday',
    );
  });

  it('describes storage usage with the shared byte formatter', () => {
    expect(describeUsage(412 * 1024 * 1024)).toBe('Using 412 MB');
    expect(describeUsage(1.5 * 1024 * 1024 * 1024)).toBe('Using 1.5 GB');
    expect(describeUsage(0)).toBeNull();
    expect(describeUsage(undefined)).toBeNull();
  });
});

describe('backup summaries', () => {
  const backup = {
    books: [
      { data: { notes: [{}, {}], highlights: [{}], bookmarks: [] } },
      { data: { notes: [{}], highlights: [], bookmarks: [{}, {}] } },
    ],
  } as unknown as LibraryBackup;

  it('counts what a backup holds', () => {
    expect(countBackup(backup)).toEqual({ books: 2, notes: 3, highlights: 1, bookmarks: 2 });
  });

  it('lists books and only the kinds of annotation that exist', () => {
    expect(describeBackupCounts({ books: 12, notes: 340, highlights: 0, bookmarks: 0 })).toBe(
      '12 books, 340 notes',
    );
    expect(describeBackupCounts({ books: 1, notes: 1, highlights: 2, bookmarks: 3 })).toBe(
      '1 book, 1 note, 2 highlights, 3 bookmarks',
    );
    expect(describeBackupCounts({ books: 2, notes: 0, highlights: 0, bookmarks: 0 })).toBe('2 books');
  });

  it('summarises a restore', () => {
    const missing = [book('Mechanics')];
    expect(describeRestore({ books: 12, updated: 12, missing })).toEqual({
      message: 'Restored notes for 12 books.',
      missing,
    });
    expect(describeRestore({ books: 3, updated: 1, missing: [] }).message).toBe('Restored notes for 1 book.');
    expect(describeRestore({ books: 3, updated: 0, missing: [] }).message).toBe(
      'Nothing new in that backup — your library already has it all.',
    );
    expect(describeRestore({ books: 0, updated: 0, missing: [] }).message).toBe(
      'That backup doesn’t contain any books.',
    );
  });

  it('labels books by title, then file name', () => {
    expect(bookLabel(book('Mechanics', 'm.pdf'))).toBe('Mechanics');
    expect(bookLabel(book('  ', 'm.pdf'))).toBe('m.pdf');
    expect(bookLabel(book('', ''))).toBe('Untitled book');
  });
});
