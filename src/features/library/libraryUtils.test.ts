import { describe, expect, it } from 'vitest';
import { isAtStart } from '@/lib/util';
import { describeReset, formatOpened, progressPercent } from './libraryUtils';

describe('start of the book', () => {
  it('is the top of the first page, give or take a hair', () => {
    expect(isAtStart({ page: 1, offset: 0 })).toBe(true);
    expect(isAtStart({ page: 1, offset: 0.01 })).toBe(true);
    expect(isAtStart({ page: 1, offset: 0.02 })).toBe(false);
    expect(isAtStart({ page: 1, offset: 0.5 })).toBe(false);
    expect(isAtStart({ page: 2, offset: 0 })).toBe(false);
  });
});

describe('describing a reset', () => {
  const none = { notes: 0, highlights: 0, bookmarks: 0 };

  it('lists what will be deleted, in plain words', () => {
    expect(describeReset({ notes: 12, highlights: 4, bookmarks: 3 }, false)).toBe(
      'This returns you to the start and deletes 12 notes, 4 highlights and 3 bookmarks. The book stays in your library. This can’t be undone.',
    );
    expect(describeReset({ notes: 1, highlights: 1, bookmarks: 1 }, false)).toContain(
      'deletes 1 note, 1 highlight and 1 bookmark.',
    );
  });

  it('leaves out what the book doesn’t have', () => {
    expect(describeReset({ ...none, notes: 2 }, false)).toContain('deletes 2 notes.');
    expect(describeReset({ ...none, highlights: 1, bookmarks: 5 }, false)).toContain(
      'deletes 1 highlight and 5 bookmarks.',
    );
  });

  it('says so when there is nothing to delete', () => {
    expect(describeReset(none, false)).toBe(
      'This returns you to the start of the book. It has no notes, highlights or bookmarks.',
    );
  });

  it('warns that other devices on the linked folder see the reset', () => {
    const sentence = 'Other devices using this folder will see the reset too.';
    expect(describeReset({ ...none, notes: 1 }, true)).toMatch(new RegExp(`undone\\. ${sentence}$`));
    expect(describeReset(none, true)).toMatch(new RegExp(`bookmarks\\. ${sentence}$`));
    expect(describeReset({ ...none, notes: 1 }, false)).not.toContain('Other devices');
  });
});

describe('library progress', () => {
  it('uses the saved page and intra-page offset', () => {
    expect(progressPercent(10)).toBe(0);
    expect(progressPercent(10, { page: 1, offset: 0 })).toBe(0);
    expect(progressPercent(10, { page: 4, offset: 0.5 })).toBe(35);
  });

  it('does not round up to 100 before the end of the last page', () => {
    expect(progressPercent(612, { page: 611, offset: 1 })).toBe(99);
    expect(progressPercent(612, { page: 612, offset: 0.5 })).toBe(99);
    expect(progressPercent(612, { page: 612, offset: 0.99 })).toBe(100);
    expect(progressPercent(1, { page: 1, offset: 1 })).toBe(100);
  });

  it('clamps corrupt values and handles missing page counts', () => {
    expect(progressPercent(0, { page: 1, offset: 0 })).toBe(0);
    expect(progressPercent(10, { page: -1, offset: -1 })).toBe(0);
    expect(progressPercent(10, { page: 50, offset: 2 })).toBe(100);
    expect(progressPercent(10, { page: Number.NaN, offset: 0 })).toBe(0);
  });
});

describe('library dates', () => {
  it('formats recent opening times', () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(formatOpened(now, now)).toBe('Opened just now');
    expect(formatOpened(now - 2 * 60 * 60 * 1000, now)).toBe('Opened 2 hours ago');
  });

  it('says a book that was never opened has not been opened', () => {
    expect(formatOpened(0)).toBe('Not opened yet');
  });
});
