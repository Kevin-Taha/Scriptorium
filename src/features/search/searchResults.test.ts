import { describe, expect, it } from 'vitest';
import { createMatcher, DEFAULT_OPTIONS } from './matcher';
import {
  centredWindow,
  countHits,
  flatIndexOf,
  formatStatus,
  hitAt,
  matchRects,
  matchTop,
  nearestHit,
  pageHighlights,
  searchPage,
  windowResults,
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

describe('windowResults', () => {
  const shape = (from: number, to: number) =>
    windowResults(FIXTURE, { from, to }).map((g) => [g.result.page, g.start, g.end]);

  // Flat positions: 0,1 → page 2; 2 → page 5; 3,4,5 → page 9.
  it('starts at the first match and trims the last page to the window', () => {
    expect(shape(0, 3)).toEqual([
      [2, 0, 2],
      [5, 0, 1],
    ]);
    expect(shape(0, 4)).toEqual([
      [2, 0, 2],
      [5, 0, 1],
      [9, 0, 1],
    ]);
    expect(shape(0, 100)).toHaveLength(3);
  });

  it('can begin in the middle of a page and skip the pages before it', () => {
    expect(shape(1, 4)).toEqual([
      [2, 1, 2],
      [5, 0, 1],
      [9, 0, 1],
    ]);
    expect(shape(2, 6)).toEqual([
      [5, 0, 1],
      [9, 0, 3],
    ]);
    expect(shape(4, 5)).toEqual([[9, 1, 2]]);
  });

  it('is empty for an empty or out-of-range window', () => {
    expect(shape(0, 0)).toEqual([]);
    expect(shape(3, 3)).toEqual([]);
    expect(shape(6, 9)).toEqual([]);
    expect(windowResults([], { from: 0, to: 10 })).toEqual([]);
  });
});

describe('centredWindow', () => {
  it('puts the centre in the middle of the window', () => {
    expect(centredWindow(500, 200, 10_000)).toEqual({ from: 400, to: 600 });
    expect(centredWindow(5, 4, 100)).toEqual({ from: 3, to: 7 });
  });

  it('stays inside the list at both ends and keeps its size where it can', () => {
    expect(centredWindow(10, 200, 10_000)).toEqual({ from: 0, to: 200 });
    expect(centredWindow(9_999, 200, 10_000)).toEqual({ from: 9_800, to: 10_000 });
    expect(centredWindow(9_950, 200, 10_000)).toEqual({ from: 9_800, to: 10_000 });
    expect(centredWindow(3, 200, 50)).toEqual({ from: 0, to: 50 });
    expect(centredWindow(0, 200, 0)).toEqual({ from: 0, to: 0 });
  });

  it('always contains the centre', () => {
    for (const center of [0, 1, 99, 100, 101, 4_999, 9_998, 9_999]) {
      const { from, to } = centredWindow(center, 200, 10_000);
      expect(center).toBeGreaterThanOrEqual(from);
      expect(center).toBeLessThan(to);
    }
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
