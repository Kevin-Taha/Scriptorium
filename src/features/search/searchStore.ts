import { create } from 'zustand';
import type { ReadingLocation } from '@/lib/types';
import { clamp } from '@/lib/util';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore } from '../reader/readerStore';
import { createMatcher, findMatches, type Matcher, type MatchRange } from './matcher';
import { cleanText, rangeRects, type PageText } from './pageText';
import { getTextIndex, pauseTextIndex, yieldToMain, type TextIndex } from './textIndex';

/** Results are published at most this often while pages stream in. */
const FLUSH_INTERVAL_MS = 100;
/** Main-thread time spent matching already indexed pages before yielding. */
const SCAN_SLICE_MS = 8;
/** Matching stops here; beyond it a query is too common to be useful. */
const MAX_HITS = 10_000;
/** Where a match lands in the viewport after a jump, as a share of the viewport height. */
const LANDING_POSITION = 1 / 3;
/** Landing offset (share of a page) used when the viewer's size is unknown. */
const FALLBACK_LEAD = 0.12;

/** All matches on one page; `text` is kept for snippets and highlight rectangles. */
export interface PageResult {
  page: number;
  text: PageText;
  matches: MatchRange[];
}

/** One match: its page and its position among that page's matches. */
export interface HitRef {
  page: number;
  index: number;
}

export interface SearchState {
  /** The cleaned query being searched for; empty when no search is live. */
  query: string;
  /** Pages with matches, in page order. */
  results: PageResult[];
  hits: number;
  /** Matching stopped at {@link MAX_HITS}. */
  capped: boolean;
  /** Pages are still being indexed. */
  searching: boolean;
  indexed: number;
  total: number;
  /** False once every page is indexed and none had text (a scanned book). */
  hasText: boolean;
  /** The chosen match; F3 steps on from it. */
  active: HitRef | null;
}

const IDLE: SearchState = {
  query: '',
  results: [],
  hits: 0,
  capped: false,
  searching: false,
  indexed: 0,
  total: 0,
  hasText: true,
  active: null,
};

export const useSearchStore = create<SearchState>()(() => IDLE);

/**
 * Searches the open book, matching pages already indexed and then each page as the
 * background index reaches it. Searching for the live query again changes nothing.
 */
export function searchBook(rawQuery: string): void {
  const query = cleanText(rawQuery);
  if (query !== '' && query === useSearchStore.getState().query) return;
  endRun();
  const matcher = createMatcher(query);
  const index = matcher && currentIndex();
  if (!matcher || !index) {
    useSearchStore.setState(IDLE);
    return;
  }
  const { pdf } = useReaderStore.getState();
  // Extraction starts at the page being read, so the first results are the ones nearest the reader.
  if (pdf) index.start(pdf, readingLocation().page);
  const current: Run = {
    cancelled: false,
    matcher,
    index,
    pages: new Map(),
    hits: 0,
    capped: false,
    scanning: true,
    lastFlush: 0,
    timer: null,
    unsubscribe: () => {},
  };
  run = current;
  current.unsubscribe = index.subscribe((page) => matchPage(current, page));
  useSearchStore.setState({
    ...IDLE,
    query: matcher.query,
    searching: true,
    indexed: index.indexed,
    total: index.total,
  });
  void scan(current);
}

export function clearSearch(): void {
  endRun();
  useSearchStore.setState(IDLE);
}

/** Makes `hit` the current match and jumps to it, recorded in history so Return comes back. */
export function chooseMatch(hit: HitRef): void {
  const target = landing(hit);
  if (!target) return;
  useSearchStore.setState({ active: hit });
  useHistoryStore.getState().jumpTo(target);
}

/** Steps to the next or previous match, wrapping around the book. Only scrolls: no history. */
export function stepMatch(direction: 1 | -1): void {
  const { results, hits, active } = useSearchStore.getState();
  const at = flatIndexOf(results, active);
  if (at === -1) return;
  const [next] = sliceHits(results, (at + direction + hits) % hits, 1);
  const target = next && landing(next);
  if (!target) return;
  useSearchStore.setState({ active: next });
  const { controller, setLocation } = useReaderStore.getState();
  if (controller) controller.scrollTo(target);
  else setLocation(target);
}

/** Position of `hit` among all matches in page order, or -1. */
export function flatIndexOf(results: readonly PageResult[], hit: HitRef | null): number {
  if (!hit) return -1;
  let before = 0;
  for (const result of results) {
    if (result.page === hit.page) return hit.index < result.matches.length ? before + hit.index : -1;
    before += result.matches.length;
  }
  return -1;
}

/** Up to `count` matches in page order, starting at position `from`. */
export function sliceHits(results: readonly PageResult[], from: number, count: number): HitRef[] {
  const hits: HitRef[] = [];
  let before = 0;
  for (const { page, matches } of results) {
    for (let index = Math.max(0, from - before); index < matches.length && hits.length < count; index++) {
      hits.push({ page, index });
    }
    before += matches.length;
  }
  return hits;
}

/** Where to scroll so the match sits a third of the way down the viewport. */
function landing(hit: HitRef): ReadingLocation | null {
  const result = useSearchStore.getState().results.find((candidate) => candidate.page === hit.page);
  const match = result?.matches[hit.index];
  if (!result || !match) return null;
  const pageHeight = useReaderStore.getState().controller?.getPageSize(hit.page)?.height;
  const viewportHeight = document.querySelector<HTMLElement>('.reader__viewport')?.clientHeight;
  const lead =
    pageHeight && viewportHeight ? (viewportHeight * LANDING_POSITION) / pageHeight : FALLBACK_LEAD;
  const top = rangeRects(result.text, match.start, match.end)[0]?.y ?? 0;
  return { page: hit.page, offset: clamp(top - lead, 0, 1) };
}

// ------------------------------------------------------------------- a run

interface Run {
  cancelled: boolean;
  matcher: Matcher;
  index: TextIndex;
  pages: Map<number, PageResult>;
  hits: number;
  capped: boolean;
  /** Still working through the pages that were indexed when the run began. */
  scanning: boolean;
  lastFlush: number;
  timer: ReturnType<typeof setTimeout> | null;
  unsubscribe(): void;
}

let run: Run | null = null;

function currentIndex(): TextIndex | null {
  const { docId, pdf, doc } = useReaderStore.getState();
  const total = pdf?.numPages ?? doc?.pageCount ?? 0;
  return docId && total > 0 ? getTextIndex(docId, total) : null;
}

function readingLocation(): ReadingLocation {
  const { controller, location } = useReaderStore.getState();
  return controller?.getLocation() ?? location;
}

function endRun(): void {
  if (!run) return;
  run.cancelled = true;
  run.unsubscribe();
  if (run.timer) clearTimeout(run.timer);
  run = null;
}

async function scan(current: Run): Promise<void> {
  let sliceStart = performance.now();
  for (const page of current.index.indexedPages()) {
    if (current.cancelled) return;
    matchPage(current, page);
    if (performance.now() - sliceStart > SCAN_SLICE_MS) {
      flush(current);
      await yieldToMain();
      sliceStart = performance.now();
    }
  }
  if (current.cancelled) return;
  current.scanning = false;
  flush(current);
}

function matchPage(current: Run, text: PageText): void {
  if (current.cancelled || current.capped) return;
  const matches = findMatches(text, current.matcher, MAX_HITS - current.hits);
  if (matches.length > 0) {
    current.pages.set(text.page, { page: text.page, text, matches });
    current.hits += matches.length;
    current.capped = current.hits >= MAX_HITS;
  }
  if (!current.timer) {
    const wait = Math.max(0, FLUSH_INTERVAL_MS - (performance.now() - current.lastFlush));
    current.timer = setTimeout(() => flush(current), wait);
  }
}

/** Publishes what the run has found so far. */
function flush(current: Run): void {
  if (current !== run) return;
  if (current.timer) clearTimeout(current.timer);
  current.timer = null;
  current.lastFlush = performance.now();
  const { index } = current;
  const searching = !current.capped && (current.scanning || !index.complete);
  if (!searching) current.unsubscribe();
  useSearchStore.setState({
    results: [...current.pages.values()].sort((a, b) => a.page - b.page),
    hits: current.hits,
    capped: current.capped,
    searching,
    indexed: index.indexed,
    total: index.total,
    hasText: !index.complete || index.hasText,
  });
}

useReaderStore.subscribe((state, previous) => {
  if (state.docId === previous.docId && state.pdf === previous.pdf) return;
  if (previous.docId) pauseTextIndex(previous.docId);
  clearSearch();
});
