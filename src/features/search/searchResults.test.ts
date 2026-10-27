import { describe, expect, it } from 'vitest';
import { createMatcher, DEFAULT_OPTIONS } from './matcher';
import {
  countHits,
  flatIndexOf,
  formatStatus,
  hitAt,
  limitResults,
  matchRects,
  matchTop,
  nearestHit,
  pageHighlights,
  searchPage,
  type PageResult,
} from './searchResults';
import { makePage } from './testPages';

function results(...pages: [number, string[]][]): PageResult[] {
  const matcher = createMatcher('x', DEFAULT_OPTIONS)!;
  return pages.map(([page, lines]) => searchPage(makePage(page, ...lines), matcher)!);
}

// Page 2: two matches (lines 1 and 3); page 5: one; page 9: three.
const FIXTURE = results([2, ['x one', 'plain', 'x two']], [5, ['only x here']], [9, ['x', 'x', 'x']]);

describe('searchPage', () => {
  it('returns null for a page without matches', () => {
    expect(searchPage(makePage(1, 'nothing'), createMatcher('x', DEFAULT_OPTIONS)!)).toBeNull();
  });

  it('keeps a snippet and the offsets of every match', () => {
    const [page] = FIXTURE;
    expect(page.matches.map((m) => m.snippet.match)).toEqual(['x', 'x']);
    expect(page.matches[0].snippet.after).toMatch(/^ one plain/);
  });
});

describe('hit addressing', () => {
  it('maps between page/index pairs and flat positions', () => {
    expect(countHits(FIXTURE)).toBe(6);
    expect(flatIndexOf(FIXTURE, { page: 2, index: 1 })).toBe(1);
    expect(flatIndexOf(FIXTURE, { page: 5, index: 0 })).toBe(2);
    expect(flatIndexOf(FIXTURE, { page: 9, index: 2 })).toBe(5);
    expect(flatIndexOf(FIXTURE, { page: 9, index: 3 })).toBe(-1);
    expect(flatIndexOf(FIXTURE, { page: 4, index: 0 })).toBe(-1);
    expect(flatIndexOf(FIXTURE, null)).toBe(-1);
    expect(hitAt(FIXTURE, 3)).toEqual({ page: 9, index: 0 });
    expect(hitAt(FIXTURE, 5)).toEqual({ page: 9, index: 2 });
    expect(hitAt(FIXTURE, 6)).toBeNull();
    expect(hitAt(FIXTURE, -1)).toBeNull();
  });
});

describe('nearestHit', () => {
  it('goes forward to the first match at or after the location, wrapping at the end', () => {
    expect(nearestHit(FIXTURE, { page: 1, offset: 0.5 }, 1)).toEqual({ page: 2, index: 0 });
    expect(nearestHit(FIXTURE, { page: 3, offset: 0 }, 1)).toEqual({ page: 5, index: 0 });
    expect(nearestHit(FIXTURE, { page: 9, offset: 0.99 }, 1)).toEqual({ page: 2, index: 0 });
  });

  it('compares positions within the location’s own page', () => {
    const top0 = matchTop(FIXTURE[0], 0);
    const top1 = matchTop(FIXTURE[0], 1);
    expect(top1).toBeGreaterThan(top0);
    expect(nearestHit(FIXTURE, { page: 2, offset: top0 }, 1)).toEqual({ page: 2, index: 0 });
    expect(nearestHit(FIXTURE, { page: 2, offset: top0 + 0.01 }, 1)).toEqual({ page: 2, index: 1 });
    expect(nearestHit(FIXTURE, { page: 2, offset: top1 + 0.01 }, 1)).toEqual({ page: 5, index: 0 });
  });

  it('goes backward to the last match before the location, wrapping at the start', () => {
    expect(nearestHit(FIXTURE, { page: 6, offset: 0 }, -1)).toEqual({ page: 5, index: 0 });
    expect(nearestHit(FIXTURE, { page: 5, offset: 0 }, -1)).toEqual({ page: 2, index: 1 });
    expect(nearestHit(FIXTURE, { page: 1, offset: 0 }, -1)).toEqual({ page: 9, index: 2 });
    const top1 = matchTop(FIXTURE[0], 1);
    expect(nearestHit(FIXTURE, { page: 2, offset: top1 }, -1)).toEqual({ page: 2, index: 0 });
  });

  it('has nothing to offer without results', () => {
    expect(nearestHit([], { page: 1, offset: 0 }, 1)).toBeNull();
  });
});

describe('limitResults', () => {
  it('keeps whole pages and trims the last one to the limit', () => {
    expect(limitResults(FIXTURE, 3).map((g) => [g.result.page, g.count])).toEqual([
      [2, 2],
      [5, 1],
    ]);
    expect(limitResults(FIXTURE, 4).map((g) => [g.result.page, g.count])).toEqual([
      [2, 2],
      [5, 1],
      [9, 1],
    ]);
    expect(limitResults(FIXTURE, 100)).toHaveLength(3);
    expect(limitResults(FIXTURE, 0)).toEqual([]);
  });
});

describe('highlight geometry', () => {
  it('computes rectangles once per match and flattens them for a page', () => {
    const [page] = FIXTURE;
    expect(matchRects(page, 0)).toBe(matchRects(page, 0));
    expect(matchRects(page, 5)).toEqual([]);
    const highlights = pageHighlights(page);
    expect(highlights.map((h) => h.match)).toEqual([0, 1]);
    expect(new Set(highlights.map((h) => h.key)).size).toBe(highlights.length);
  });
});

describe('formatStatus', () => {
  const base = { query: 'force', hits: 37, pages: 21, capped: false, indexed: 412, total: 708 };

  it('summarises finished searches', () => {
    expect(formatStatus({ ...base, phase: 'done' })).toBe('37 results on 21 pages');
    expect(formatStatus({ ...base, phase: 'done', hits: 1, pages: 1 })).toBe('1 result on 1 page');
    expect(formatStatus({ ...base, phase: 'done', hits: 12_345, pages: 600 })).toBe(
      '12,345 results on 600 pages',
    );
    expect(formatStatus({ ...base, phase: 'done', hits: 10_000, pages: 640, capped: true })).toBe(
      '10,000+ results on 640 pages',
    );
  });

  it('shows the position of the active match', () => {
    expect(formatStatus({ ...base, phase: 'done', position: 3 })).toBe('3 of 37 results on 21 pages');
  });

  it('reports indexing progress, with or without results so far', () => {
    expect(formatStatus({ ...base, phase: 'searching', hits: 0, pages: 0 })).toBe(
      'Searching… 412 of 708 pages',
    );
    expect(formatStatus({ ...base, phase: 'searching' })).toBe('37 results so far · 412 of 708 pages');
  });

  it('reports no results and says nothing when idle', () => {
    expect(formatStatus({ ...base, phase: 'done', hits: 0, pages: 0 })).toBe('No results for “force”');
    expect(formatStatus({ ...base, phase: 'idle' })).toBe('');
  });
});
