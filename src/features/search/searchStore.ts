import { create } from 'zustand';
import type { ReadingLocation } from '@/lib/types';
import { clamp, debounce } from '@/lib/util';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore } from '../reader/readerStore';
import { createMatcher, DEFAULT_OPTIONS, type Matcher, type SearchOptions } from './matcher';
import { cleanText, type PageText } from './pageText';
import { viewportHeight } from './searchDom';
import {
  countHits,
  flatIndexOf,
  hitAt,
  matchTop,
  nearestHit,
  searchPage,
  type HitRef,
  type PageResult,
  type SearchPhase,
} from './searchResults';
import { getTextIndex, pauseTextIndex, yieldToMain, type TextIndex } from './textIndex';

/** Typing pauses this long before the query is applied. */
const QUERY_DEBOUNCE_MS = 150;
/** Results are published to the UI at most this often while pages stream in. */
const FLUSH_INTERVAL_MS = 100;
/** Main-thread time spent matching before yielding, when scanning pages that are already indexed. */
const SCAN_SLICE_MS = 8;
/** Matching stops here; beyond it a query is too common to be useful. */
const MAX_HITS = 10_000;
/** Where a match lands in the viewport after a jump, as a share of the viewport height. */
const LANDING_POSITION = 1 / 3;
/** Landing offset (share of a page) used when the viewer's size is unknown. */
const FALLBACK_LEAD = 0.12;

interface SearchState {
  /** What the search field holds right now. */
  query: string;
  options: SearchOptions;
  /** The cleaned query the results belong to (`query` once its debounce has passed). */
  appliedQuery: string;
  /** Changes whenever a new search starts; lets the UI reset per-search state. */
  runId: number;
  results: PageResult[];
  byPage: ReadonlyMap<number, PageResult>;
  hitCount: number;
  /** True when matching stopped at {@link MAX_HITS}. */
  capped: boolean;
  phase: SearchPhase;
  /** Pages whose text has been extracted, of `total`. */
  indexed: number;
  total: number;
  /** False once every page is indexed and none had any text (a scanned book). */
  hasText: boolean;
  active: HitRef | null;
  /** Position of the active match among all matches, or -1. */
  activeIndex: number;

  setQuery(query: string): void;
  /** Applies a pending (debounced) query right away. */
  commitQuery(): void;
  setOptions(patch: Partial<SearchOptions>): void;
  next(): void;
  prev(): void;
  /** Makes `hit` the active match and goes to it. */
  activate(hit: HitRef): void;
  clear(): void;
  /** Starts extracting the book's text in the background, ahead of the first search. */
  prepare(): void;
  /** Ends a stepping session: the next jump is recorded in history again. */
  endSession(): void;
  reset(): void;
}

const NO_RESULTS = {
  results: [] as PageResult[],
  byPage: new Map<number, PageResult>() as ReadonlyMap<number, PageResult>,
  hitCount: 0,
  capped: false,
  phase: 'idle' as SearchPhase,
  indexed: 0,
  total: 0,
  hasText: true,
  active: null as HitRef | null,
  activeIndex: -1,
};

export const useSearchStore = create<SearchState>()((set, get) => ({
  query: '',
  options: DEFAULT_OPTIONS,
  appliedQuery: '',
  runId: 0,
  ...NO_RESULTS,

  setQuery(query) {
    set({ query });
    if (cleanText(query) === '') {
      applyQuery.cancel();
      beginRun();
    } else {
      applyQuery();
    }
  },

  commitQuery: () => applyQuery.flush(),

  setOptions(patch) {
    set((state) => ({ options: { ...state.options, ...patch } }));
    applyQuery.cancel();
    if (cleanText(get().query) !== '') beginRun();
  },

  next: () => step(1),
  prev: () => step(-1),
  activate: (hit) => activateHit(hit),

  clear() {
    applyQuery.cancel();
    set({ query: '' });
    beginRun();
  },

  prepare() {
    const index = currentIndex();
    if (index) warmIndex(index);
  },

  endSession() {
    anchored = false;
  },

  reset() {
    applyQuery.cancel();
    endRun();
    anchored = false;
    pendingStep = null;
    set({ query: '', appliedQuery: '', runId: get().runId + 1, ...NO_RESULTS });
  },
}));

const applyQuery = debounce(() => {
  const { query, appliedQuery } = useSearchStore.getState();
  if (appliedQuery === '' || cleanText(query) !== appliedQuery) beginRun();
}, QUERY_DEBOUNCE_MS);

// ------------------------------------------------------------------- a run

/** One search of the book: matches pages already indexed, then each page as it is indexed. */
interface Run {
  cancelled: boolean;
  matcher: Matcher;
  index: TextIndex;
  pages: Map<number, PageResult>;
  seen: Set<number>;
  hits: number;
  capped: boolean;
  /** Still working through pages that were indexed when the run began. */
  scanning: boolean;
  lastFlush: number;
  timer: ReturnType<typeof setTimeout> | null;
  unsubscribe(): void;
}

let run: Run | null = null;
/** Whether this search session has already recorded a jump in the navigation history. */
let anchored = false;
/** A next/prev asked for before any result existed; carried out when the first one arrives. */
let pendingStep: 1 | -1 | null = null;

function currentIndex(): TextIndex | null {
  const { docId, pdf, doc } = useReaderStore.getState();
  const total = pdf?.numPages ?? doc?.pageCount ?? 0;
  return docId && total > 0 ? getTextIndex(docId, total) : null;
}

function readingLocation(): ReadingLocation {
  const { controller, location } = useReaderStore.getState();
  return controller?.getLocation() ?? location;
}

/** Extraction starts at the page being read, so the first results are the ones nearest the reader. */
function warmIndex(index: TextIndex): void {
  const { pdf } = useReaderStore.getState();
  if (pdf) index.start(pdf, readingLocation().page);
}

function endRun(): void {
  if (!run) return;
  run.cancelled = true;
  run.unsubscribe();
  if (run.timer) clearTimeout(run.timer);
  run = null;
}

function beginRun(): void {
  endRun();
  anchored = false;
  pendingStep = null;
  const { query, options, runId } = useSearchStore.getState();
  const matcher = createMatcher(query, options);
  const index = matcher ? currentIndex() : null;
  if (!matcher || !index) {
    useSearchStore.setState({ appliedQuery: '', runId: runId + 1, ...NO_RESULTS });
    return;
  }

  warmIndex(index);
  const current: Run = {
    cancelled: false,
    matcher,
    index,
    pages: new Map(),
    seen: new Set(),
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
    appliedQuery: matcher.query,
    runId: runId + 1,
    ...NO_RESULTS,
    phase: 'searching',
    indexed: index.indexed,
    total: index.total,
  });
  void scan(current);
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

function matchPage(current: Run, pageText: PageText): void {
  if (current.cancelled || current.seen.has(pageText.page)) return;
  current.seen.add(pageText.page);
  if (current.capped) return;
  const result = searchPage(pageText, current.matcher, MAX_HITS - current.hits);
  if (result) {
    current.pages.set(result.page, result);
    current.hits += result.matches.length;
    current.capped = current.hits >= MAX_HITS;
  }
  scheduleFlush(current);
}

function scheduleFlush(current: Run): void {
  if (current.timer) return;
  const wait = Math.max(0, FLUSH_INTERVAL_MS - (performance.now() - current.lastFlush));
  current.timer = setTimeout(() => flush(current), wait);
}

/** Publishes what the run has found so far. */
function flush(current: Run): void {
  if (current !== run) return;
  if (current.timer) clearTimeout(current.timer);
  current.timer = null;
  current.lastFlush = performance.now();

  const results = [...current.pages.values()].sort((a, b) => a.page - b.page);
  const finished = current.capped || (!current.scanning && current.index.complete);
  if (finished) current.unsubscribe();
  useSearchStore.setState((state) => ({
    results,
    byPage: new Map(results.map((result) => [result.page, result])),
    hitCount: current.hits,
    capped: current.capped,
    phase: finished ? 'done' : 'searching',
    indexed: current.index.indexed,
    total: current.index.total,
    hasText: !current.index.complete || current.index.hasText,
    activeIndex: flatIndexOf(results, state.active),
  }));

  if (pendingStep !== null && current.hits > 0) {
    const direction = pendingStep;
    pendingStep = null;
    step(direction);
  }
}

// --------------------------------------------------------------- stepping

function step(direction: 1 | -1): void {
  useSearchStore.getState().commitQuery();
  const { results, active, phase } = useSearchStore.getState();
  const total = countHits(results);
  if (total === 0) {
    if (phase === 'searching') pendingStep = direction;
    return;
  }
  const current = flatIndexOf(results, active);
  const target =
    current === -1
      ? nearestHit(results, readingLocation(), direction)
      : hitAt(results, (current + direction + total) % total);
  if (target) activateHit(target);
}

function activateHit(hit: HitRef): void {
  const { results } = useSearchStore.getState();
  const result = results.find((candidate) => candidate.page === hit.page);
  if (!result?.matches[hit.index]) return;
  useSearchStore.setState({ active: hit, activeIndex: flatIndexOf(results, hit) });
  goTo(result, hit.index);
}

/**
 * Brings a match into view about a third of the way down the viewport. Only the
 * first jump of a search session is a deliberate jump (recorded, so Return works);
 * stepping through the other matches just scrolls.
 */
function goTo(result: PageResult, index: number): void {
  const reader = useReaderStore.getState();
  const pageHeight = reader.controller?.getPageSize(result.page)?.height;
  const visibleHeight = viewportHeight();
  const lead = pageHeight && visibleHeight ? (visibleHeight * LANDING_POSITION) / pageHeight : FALLBACK_LEAD;
  const target: ReadingLocation = {
    page: result.page,
    offset: clamp(matchTop(result, index) - lead, 0, 1),
  };

  if (!anchored) {
    const history = useHistoryStore.getState();
    const before = history.back;
    history.jumpTo(target);
    // A match on the spot the reader already occupies records nothing; keep trying.
    anchored = useHistoryStore.getState().back !== before;
  } else if (reader.controller) {
    reader.controller.scrollTo(target);
  } else {
    reader.setLocation(target);
  }
}

// --------------------------------------------------------- document changes

useReaderStore.subscribe((state, previous) => {
  if (state.docId === previous.docId && state.pdf === previous.pdf) return;
  if (previous.docId) pauseTextIndex(previous.docId);
  useSearchStore.getState().reset();
});
