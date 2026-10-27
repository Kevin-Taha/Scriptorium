import type { ReadingLocation } from '@/lib/types';
import { buildSnippet, findMatches, type Matcher, type MatchRange, type Snippet } from './matcher';
import { rangeRects, type PageRect, type PageText } from './pageText';

export interface SearchMatch extends MatchRange {
  snippet: Snippet;
}

/** All matches on one page; `text` is kept so rectangles can be computed on demand. */
export interface PageResult {
  page: number;
  text: PageText;
  matches: SearchMatch[];
}

/** One match: the page and its position among that page's matches. */
export interface HitRef {
  page: number;
  index: number;
}

export type SearchPhase = 'idle' | 'searching' | 'done';

export function searchPage(pageText: PageText, matcher: Matcher, limit = Infinity): PageResult | null {
  const ranges = findMatches(pageText, matcher, limit);
  if (ranges.length === 0) return null;
  return {
    page: pageText.page,
    text: pageText,
    matches: ranges.map((range) => ({
      ...range,
      snippet: buildSnippet(pageText.text, range.start, range.end),
    })),
  };
}

// ---------------------------------------------------------------- geometry

const rectCache = new WeakMap<SearchMatch, PageRect[]>();

/** Highlight rectangles of one match (cached: the geometry never changes for a given match). */
export function matchRects(result: PageResult, index: number): PageRect[] {
  const match = result.matches[index];
  if (!match) return [];
  let rects = rectCache.get(match);
  if (!rects) {
    rects = rangeRects(result.text, match.start, match.end);
    rectCache.set(match, rects);
  }
  return rects;
}

/** Vertical position of a match on its page, 0 (top) to 1 (bottom). */
export function matchTop(result: PageResult, index: number): number {
  return matchRects(result, index)[0]?.y ?? 0;
}

export interface PageHighlight {
  key: string;
  /** Index of the match among the page's matches. */
  match: number;
  rect: PageRect;
}

export function pageHighlights(result: PageResult): PageHighlight[] {
  return result.matches.flatMap((_, match) =>
    matchRects(result, match).map((rect, i) => ({ key: `${match}.${i}`, match, rect })),
  );
}

// -------------------------------------------------------------- navigation

export function countHits(results: readonly PageResult[]): number {
  let count = 0;
  for (const result of results) count += result.matches.length;
  return count;
}

/** Position of `hit` in the flat, page-ordered list of all matches, or -1. */
export function flatIndexOf(results: readonly PageResult[], hit: HitRef | null): number {
  if (!hit) return -1;
  let before = 0;
  for (const result of results) {
    if (result.page === hit.page) return hit.index < result.matches.length ? before + hit.index : -1;
    before += result.matches.length;
  }
  return -1;
}

export function hitAt(results: readonly PageResult[], flatIndex: number): HitRef | null {
  if (flatIndex < 0) return null;
  let remaining = flatIndex;
  for (const result of results) {
    if (remaining < result.matches.length) return { page: result.page, index: remaining };
    remaining -= result.matches.length;
  }
  return null;
}

/** Slack so a match at the very top of the viewport still counts as "here". */
const POSITION_EPSILON = 0.002;

/**
 * The first match at or below `location` (or, going backwards, the last one
 * above it), wrapping around the book. Used before any match is active.
 */
export function nearestHit(
  results: readonly PageResult[],
  location: ReadingLocation,
  direction: 1 | -1,
  top: (result: PageResult, index: number) => number = matchTop,
): HitRef | null {
  if (results.length === 0) return null;
  const first = (result: PageResult): HitRef => ({ page: result.page, index: 0 });
  const last = (result: PageResult): HitRef => ({ page: result.page, index: result.matches.length - 1 });

  if (direction === 1) {
    for (const result of results) {
      if (result.page < location.page) continue;
      if (result.page > location.page) return first(result);
      const index = result.matches.findIndex((_, i) => top(result, i) >= location.offset - POSITION_EPSILON);
      if (index !== -1) return { page: result.page, index };
    }
    return first(results[0]);
  }

  for (let r = results.length - 1; r >= 0; r--) {
    const result = results[r];
    if (result.page > location.page) continue;
    if (result.page < location.page) return last(result);
    for (let i = result.matches.length - 1; i >= 0; i--) {
      if (top(result, i) < location.offset - POSITION_EPSILON) return { page: result.page, index: i };
    }
  }
  return last(results[results.length - 1]);
}

// ------------------------------------------------------------ result list

export interface ShownGroup {
  result: PageResult;
  /** How many of the page's matches are shown (always from the first). */
  count: number;
}

/** The first `limit` matches, still grouped by page. */
export function limitResults(results: readonly PageResult[], limit: number): ShownGroup[] {
  const groups: ShownGroup[] = [];
  let remaining = limit;
  for (const result of results) {
    if (remaining <= 0) break;
    const count = Math.min(result.matches.length, remaining);
    groups.push({ result, count });
    remaining -= count;
  }
  return groups;
}

// ------------------------------------------------------------------ status

export interface StatusInput {
  phase: SearchPhase;
  query: string;
  hits: number;
  pages: number;
  capped: boolean;
  indexed: number;
  total: number;
  /** 1-based position of the active match, or 0 when none is active. */
  position?: number;
}

const numbers = new Intl.NumberFormat('en-US');

function count(amount: number, noun: string, capped = false): string {
  const plural = amount !== 1 || capped;
  return `${numbers.format(amount)}${capped ? '+' : ''} ${noun}${plural ? 's' : ''}`;
}

/** The one-line summary under the search field. */
export function formatStatus({
  phase,
  query,
  hits,
  pages,
  capped,
  indexed,
  total,
  position = 0,
}: StatusInput): string {
  if (phase === 'idle') return '';
  const progress = `${numbers.format(indexed)} of ${numbers.format(total)} pages`;
  if (phase === 'searching') {
    return hits > 0 ? `${count(hits, 'result')} so far · ${progress}` : `Searching… ${progress}`;
  }
  if (hits === 0) return `No results for “${query}”`;
  const summary = `${count(hits, 'result', capped)} on ${count(pages, 'page')}`;
  return position > 0 ? `${numbers.format(position)} of ${summary}` : summary;
}
