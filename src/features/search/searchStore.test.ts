import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingLocation } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore, type ViewerController } from '../reader/readerStore';
import { DEFAULT_OPTIONS } from './matcher';
import { matchTop } from './searchResults';
import { useSearchStore } from './searchStore';
import { makePage } from './testPages';
import { clearTextIndexes, getTextIndex } from './textIndex';

const loc = (page: number, offset = 0): ReadingLocation => ({ page, offset });
const search = () => useSearchStore.getState();

interface Harness {
  scrollTo: ReturnType<typeof vi.fn>;
  setLocation(location: ReadingLocation): void;
}

/** Opens a pretend book (one entry of text lines per page) and a viewer controller at `at`. */
function openBook(pages: string[][], at: ReadingLocation = loc(1)): Harness {
  useReaderStore.setState({ docId: 'book', doc: { pageCount: pages.length } as never, pdf: null });
  const index = getTextIndex('book', pages.length);
  pages.forEach((lines, i) => {
    index.add(makePage(i + 1, ...lines));
  });

  let current = at;
  const scrollTo = vi.fn((location: ReadingLocation) => {
    current = location;
  });
  const controller: ViewerController = {
    scrollTo,
    getLocation: () => current,
    getVisibleCenter: () => current,
    getPageSize: () => ({ width: 600, height: 1000 }),
  };
  useReaderStore.setState({ controller, location: at });
  return { scrollTo, setLocation: (location) => (current = location) };
}

function type(query: string) {
  search().setQuery(query);
  search().commitQuery();
}

beforeEach(() => {
  clearTextIndexes();
  useReaderStore.setState({ docId: null, doc: null, pdf: null, controller: null, location: loc(1) });
  useHistoryStore.getState().reset();
  search().reset();
  useSearchStore.setState({ options: DEFAULT_OPTIONS });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const BOOK = [
  ['force one', 'plain', 'force two'], // page 1: 2 hits
  ['nothing here'],
  ['a force'], // page 3: 1 hit
];

describe('searching', () => {
  it('finds matches page by page and reports a finished search', () => {
    openBook(BOOK);
    type('force');
    expect(search()).toMatchObject({ phase: 'done', hitCount: 3, appliedQuery: 'force', activeIndex: -1 });
    expect(search().results.map((r) => r.page)).toEqual([1, 3]);
    expect(search().byPage.get(3)?.matches).toHaveLength(1);
  });

  it('waits for typing to pause before searching, but not for an empty query', () => {
    vi.useFakeTimers();
    openBook(BOOK);
    search().setQuery('forc');
    search().setQuery('force');
    expect(search().query).toBe('force');
    expect(search().phase).toBe('idle');
    vi.advanceTimersByTime(149);
    expect(search().phase).toBe('idle');
    vi.advanceTimersByTime(2);
    expect(search().hitCount).toBe(3);

    search().setQuery('  ');
    expect(search()).toMatchObject({ phase: 'idle', hitCount: 0, results: [] });
  });

  it('streams in results as pages are indexed, with progress', () => {
    vi.useFakeTimers();
    useReaderStore.setState({ docId: 'book', doc: { pageCount: 4 } as never });
    const index = getTextIndex('book', 4);
    index.add(makePage(1, 'force'));
    type('force');
    expect(search()).toMatchObject({ phase: 'searching', indexed: 1, total: 4, hitCount: 1 });

    index.add(makePage(2, 'no'));
    index.add(makePage(3, 'more force and force'));
    vi.advanceTimersByTime(150);
    expect(search()).toMatchObject({ phase: 'searching', indexed: 3, hitCount: 3 });

    index.add(makePage(4, 'end'));
    vi.advanceTimersByTime(150);
    expect(search()).toMatchObject({ phase: 'done', indexed: 4, hitCount: 3 });
    expect(search().results.map((r) => r.page)).toEqual([1, 3]);
  });

  it('keeps the active match active as earlier pages stream in', () => {
    vi.useFakeTimers();
    openBook([], loc(1));
    useReaderStore.setState({ docId: 'book', doc: { pageCount: 3 } as never });
    const index = getTextIndex('book', 3);
    index.add(makePage(3, 'force'));
    type('force');
    search().next();
    expect(search()).toMatchObject({ active: { page: 3, index: 0 }, activeIndex: 0 });

    index.add(makePage(1, 'force and force'));
    vi.advanceTimersByTime(150);
    expect(search()).toMatchObject({ active: { page: 3, index: 0 }, activeIndex: 2, hitCount: 3 });
  });

  it('reapplies the query when an option changes', () => {
    openBook([['Force and force']]);
    type('force');
    expect(search().hitCount).toBe(2);
    search().setOptions({ matchCase: true });
    expect(search().hitCount).toBe(1);
    search().setOptions({ wholeWord: true, matchCase: false });
    expect(search().hitCount).toBe(2);
    expect(search().options).toEqual({ matchCase: false, wholeWord: true });
  });

  it('stops at a hit limit for very common queries', () => {
    openBook([['a '.repeat(12_000)]]);
    type('a');
    expect(search()).toMatchObject({ phase: 'done', hitCount: 10_000, capped: true });
  });

  it('clears everything, and when the document changes', () => {
    openBook(BOOK);
    type('force');
    search().next();
    search().clear();
    expect(search()).toMatchObject({ query: '', phase: 'idle', hitCount: 0, active: null });

    type('force');
    useReaderStore.setState({ docId: 'other' });
    expect(search()).toMatchObject({ query: '', phase: 'idle', results: [], active: null });
  });
});

describe('stepping through matches', () => {
  it('steps forward and backward, wrapping around the book', () => {
    openBook(BOOK);
    type('force');
    const order: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      search().next();
      order.push([search().active!.page, search().active!.index]);
    }
    expect(order).toEqual([
      [1, 0],
      [1, 1],
      [3, 0],
      [1, 0],
    ]);

    search().prev();
    expect(search().active).toEqual({ page: 3, index: 0 });
    search().prev();
    search().prev();
    expect(search().active).toEqual({ page: 1, index: 0 });
    expect(search().activeIndex).toBe(0);
  });

  it('starts from the reader’s position rather than the top of the book', () => {
    openBook(BOOK, loc(2, 0.1));
    type('force');
    search().next();
    expect(search().active).toEqual({ page: 3, index: 0 });
    search().reset();

    useReaderStore.setState({ docId: 'book' });
    openBook(BOOK, loc(2, 0.1));
    type('force');
    search().prev();
    expect(search().active).toEqual({ page: 1, index: 1 });
  });

  it('applies a pending query before stepping', () => {
    vi.useFakeTimers();
    openBook(BOOK);
    search().setQuery('force');
    search().next();
    expect(search().active).toEqual({ page: 1, index: 0 });
  });

  it('carries out a step asked for before the first result arrives', () => {
    vi.useFakeTimers();
    useReaderStore.setState({ docId: 'book', doc: { pageCount: 3 } as never });
    const index = getTextIndex('book', 3);
    type('force');
    search().next();
    expect(search().active).toBeNull();

    index.add(makePage(2, 'the force'));
    vi.advanceTimersByTime(150);
    expect(search().active).toEqual({ page: 2, index: 0 });
  });

  it('does nothing when there are no matches', () => {
    const { scrollTo } = openBook(BOOK);
    type('absent');
    search().next();
    search().prev();
    expect(search().active).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('activates a specific match', () => {
    openBook(BOOK);
    type('force');
    search().activate({ page: 3, index: 0 });
    expect(search()).toMatchObject({ active: { page: 3, index: 0 }, activeIndex: 2 });
    search().activate({ page: 3, index: 9 });
    expect(search().active).toEqual({ page: 3, index: 0 });
  });
});

describe('navigation history', () => {
  const history = () => useHistoryStore.getState();

  it('records only the first jump of a search session, so Return goes back to where you were', () => {
    const { scrollTo } = openBook(BOOK, loc(2, 0.5));
    type('force');
    search().next();
    expect(history().back).toEqual([loc(2, 0.5)]);
    expect(history().returnTarget).toEqual(loc(2, 0.5));

    search().next();
    search().next();
    search().prev();
    expect(history().back).toEqual([loc(2, 0.5)]);
    expect(history().returnTarget).toEqual(loc(2, 0.5));
    expect(scrollTo).toHaveBeenCalledTimes(4);

    history().goBack();
    expect(scrollTo).toHaveBeenLastCalledWith(loc(2, 0.5));
  });

  it('records a new jump after the query changes', () => {
    const { setLocation } = openBook(BOOK, loc(2, 0.5));
    type('force');
    search().next();
    search().next();
    expect(history().back).toHaveLength(1);

    type('plain');
    setLocation(loc(1, 0.4));
    search().next();
    expect(history().back).toHaveLength(2);
    expect(history().returnTarget).toEqual(loc(1, 0.4));
  });

  it('records a new jump after the panel closes', () => {
    openBook([['force'], ['x'], ['force'], ['y'], ['force']], loc(2, 0.5));
    type('force');
    search().next();
    search().next();
    expect(history().back).toHaveLength(1);
    search().endSession();
    search().next();
    expect(history().back).toHaveLength(2);
  });

  it('keeps trying to record while matches land where the reader already is', () => {
    const { setLocation } = openBook(BOOK, loc(1, 0));
    type('force');
    search().next(); // page 1, near the top: same place, nothing to record
    expect(history().back).toEqual([]);

    setLocation(loc(1, 0));
    search().next();
    search().next(); // page 3
    expect(history().back).toEqual([loc(1, 0)]);
    expect(history().returnTarget).toEqual(loc(1, 0));
  });

  it('lands the match a third of the way down the viewport', () => {
    const viewport = document.createElement('div');
    viewport.className = 'reader__viewport';
    Object.defineProperty(viewport, 'clientHeight', { value: 600 });
    document.body.append(viewport);

    const lines = Array.from({ length: 40 }, (_, i) => (i === 30 ? 'the force' : 'filler'));
    const { scrollTo } = openBook([lines], loc(1, 0));
    type('force');
    search().next();
    const top = matchTop(search().results[0], 0);
    expect(top).toBeGreaterThan(0.5);
    // Page is 1000px tall in the mock, the viewport 600px: a third of it is 0.2 of the page.
    const [target] = scrollTo.mock.calls[0] as [ReadingLocation];
    expect(target.page).toBe(1);
    expect(target.offset).toBeCloseTo(top - 0.2, 6);
  });
});
