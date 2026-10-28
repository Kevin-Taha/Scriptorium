import { describe, expect, it } from 'vitest';
import type { BookData } from '../storage/repository';
import type { Bookmark, Highlight, MarginNote, ReadingState, Tombstone } from '../types';
import { canonicalBookData, isEmptyBookData, mergeBookData, sameBookData, stableStringify } from './merge';

const note = (id: string, updatedAt: number, text = id): MarginNote => ({
  id,
  docId: 'book',
  page: 1,
  y: 0.5,
  text,
  color: 'amber',
  createdAt: 0,
  updatedAt,
});

const highlight = (id: string, updatedAt: number): Highlight => ({
  id,
  docId: 'book',
  page: 2,
  rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.02 }],
  text: id,
  color: 'sky',
  createdAt: 0,
  updatedAt,
});

const bookmark = (id: string, createdAt: number, label = id, updatedAt?: number): Bookmark => ({
  id,
  docId: 'book',
  page: 3,
  label,
  createdAt,
  updatedAt,
});

const tombstone = (id: string, kind: Tombstone['kind'], deletedAt: number): Tombstone => ({
  id,
  kind,
  docId: 'book',
  deletedAt,
});

const progress = (page: number, updatedAt: number): ReadingState => ({
  docId: 'book',
  location: { page, offset: 0 },
  zoom: { mode: 'fit-width', scale: 1 },
  updatedAt,
});

const data = (parts: Partial<BookData>): BookData => ({
  notes: [],
  highlights: [],
  bookmarks: [],
  tombstones: [],
  ...parts,
});

describe('mergeBookData', () => {
  it('unions records from every device', () => {
    const merged = mergeBookData([data({ notes: [note('a', 1)] }), data({ notes: [note('b', 1)] })]);
    expect(merged.notes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('keeps the most recently edited copy of a record', () => {
    const merged = mergeBookData([
      data({ notes: [note('a', 5, 'newer')] }),
      data({ notes: [note('a', 3, 'older')] }),
    ]);
    expect(merged.notes).toEqual([note('a', 5, 'newer')]);
  });

  it('treats a bookmark without updatedAt as edited when created', () => {
    const merged = mergeBookData([
      data({ bookmarks: [bookmark('b', 1, 'renamed', 10)] }),
      data({ bookmarks: [bookmark('b', 1, 'original')] }),
    ]);
    expect(merged.bookmarks[0].label).toBe('renamed');
  });

  it('deletes a record when its tombstone is at least as new as its last edit', () => {
    const merged = mergeBookData([
      data({ highlights: [highlight('h', 4)] }),
      data({ tombstones: [tombstone('h', 'highlight', 4)] }),
    ]);
    expect(merged.highlights).toEqual([]);
    expect(merged.tombstones.map((t) => t.id)).toEqual(['h']);
  });

  it('revives a record edited after its deletion and drops the stale tombstone', () => {
    const merged = mergeBookData([
      data({ notes: [note('a', 9)] }),
      data({ tombstones: [tombstone('a', 'note', 5)] }),
    ]);
    expect(merged.notes.map((n) => n.id)).toEqual(['a']);
    expect(merged.tombstones).toEqual([]);
  });

  it('keeps the newest reading position', () => {
    const merged = mergeBookData([
      data({ progress: progress(10, 1) }),
      data({ progress: progress(42, 2) }),
      data({}),
    ]);
    expect(merged.progress?.location.page).toBe(42);
  });

  it('converges regardless of the order devices are merged in', () => {
    const a = data({
      notes: [note('x', 2, 'a')],
      progress: progress(5, 3),
      tombstones: [tombstone('y', 'note', 4)],
    });
    const b = data({ notes: [note('x', 2, 'b'), note('y', 3)], highlights: [highlight('h', 1)] });
    const c = data({ bookmarks: [bookmark('k', 1)], progress: progress(7, 3) });
    const orders = [
      [a, b, c],
      [c, b, a],
      [b, a, c],
    ];
    const results = orders.map((sets) => canonicalBookData(mergeBookData(sets)));
    expect(new Set(results).size).toBe(1);
    // Associative: merging a merge gives the same result.
    expect(canonicalBookData(mergeBookData([mergeBookData([a, b]), c]))).toBe(results[0]);
  });

  it('is idempotent', () => {
    const a = data({
      notes: [note('x', 2)],
      tombstones: [tombstone('y', 'note', 4)],
      progress: progress(5, 3),
    });
    const once = mergeBookData([a]);
    expect(sameBookData(mergeBookData([once, once]), once)).toBe(true);
  });
});

describe('book data helpers', () => {
  it('compares data regardless of record and key order', () => {
    const one = data({ notes: [note('a', 1), note('b', 1)] });
    const two = data({
      notes: [{ ...note('b', 1) }, note('a', 1)].map((n) => JSON.parse(JSON.stringify(n))),
    });
    expect(sameBookData(one, two)).toBe(true);
    expect(sameBookData(one, data({ notes: [note('a', 1)] }))).toBe(false);
  });

  it('sorts object keys when stringifying', () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
  });

  it('knows when there is nothing to sync', () => {
    expect(isEmptyBookData(data({}))).toBe(true);
    expect(isEmptyBookData(data({ tombstones: [tombstone('a', 'note', 1)] }))).toBe(false);
  });
});
