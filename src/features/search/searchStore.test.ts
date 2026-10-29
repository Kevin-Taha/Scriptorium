import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingLocation } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore, type ViewerController } from '../reader/readerStore';
import { rangeRects } from './pageText';
import { chooseMatch, clearSearch, searchBook, stepMatch, useSearchStore } from './searchStore';
import { makePage } from './testPages';
import { clearTextIndexes, getTextIndex } from './textIndex';

const loc = (page: number, offset = 0): ReadingLocation => ({ page, offset });
const search = () => useSearchStore.getState();
const history = () => useHistoryStore.getState();

/** Opens a pretend book (one entry of text lines per page), indexed, with a viewer at `at`. */
function openBook(pages: string[][], at: ReadingLocation = loc(1)) {
  useReaderStore.setState({ docId: 'book', doc: { pageCount: pages.length } as never, pdf: null });
  const index = getTextIndex('book', pages.length);
  pages.forEach((lines, i) => {
    if (lines.length) index.add(makePage(i + 1, ...lines));
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
  return { index, scrollTo };
}

beforeEach(() => {
  clearTextIndexes();
  useReaderStore.setState({ docId: null, doc: null, pdf: null, controller: null, location: loc(1) });
  useHistoryStore.getState().reset();
  clearSearch();
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
  it('finds matches page by page', async () => {
    openBook(BOOK);
    searchBook('  Force ');
    await vi.waitFor(() => expect(search().searching).toBe(false));
    expect(search()).toMatchObject({ query: 'Force', hits: 3, active: null, hasText: true });
    expect(search().results.map((r) => [r.page, r.matches.length])).toEqual([
      [1, 2],
      [3, 1],
    ]);
  });

  it('streams in results as pages are indexed, with progress', () => {
    vi.useFakeTimers();
    const { index } = openBook([['force'], [], [], []]);
    searchBook('force');
    vi.advanceTimersByTime(150);
    expect(search()).toMatchObject({ searching: true, indexed: 1, total: 4, hits: 1 });

    index.add(makePage(2, 'no'));
    index.add(makePage(3, 'more force and force'));
    vi.advanceTimersByTime(150);
    expect(search()).toMatchObject({ searching: true, indexed: 3, hits: 3 });

    index.add(makePage(4, 'end'));
    vi.advanceTimersByTime(150);
    expect(search()).toMatchObject({ searching: false, indexed: 4, hits: 3 });
  });

  it('keeps a live search when asked for it again, and clears it, also when the book changes', async () => {
    openBook(BOOK);
    searchBook('force');
    await vi.waitFor(() => expect(search().hits).toBe(3));
    chooseMatch({ page: 3, index: 0 });
    searchBook('force ');
    expect(search().active).toEqual({ page: 3, index: 0 });
    clearSearch();
    expect(search()).toMatchObject({ query: '', hits: 0, results: [], active: null });

    searchBook('force');
    useReaderStore.setState({ docId: 'other' });
    expect(search()).toMatchObject({ query: '', results: [], active: null });
  });

  it('stops at a hit limit for very common queries', async () => {
    openBook([['a '.repeat(12_000)]]);
    searchBook('a');
    await vi.waitFor(() => expect(search().searching).toBe(false));
    expect(search()).toMatchObject({ hits: 10_000, capped: true });
  });

  it('notices a scanned book', async () => {
    const { index } = openBook([[], []]);
    index.add(makePage(1));
    index.add(makePage(2));
    searchBook('force');
    await vi.waitFor(() => expect(search().searching).toBe(false));
    expect(search().hasText).toBe(false);
  });
});

describe('choosing and stepping', () => {
  it('records the chosen match in history, and steps without adding any, wrapping around', async () => {
    const { scrollTo } = openBook(BOOK, loc(2, 0.5));
    searchBook('force');
    await vi.waitFor(() => expect(search().hits).toBe(3));
    chooseMatch({ page: 1, index: 1 });
    expect(history().returnTarget).toEqual(loc(2, 0.5));

    const visited: [number, number][] = [];
    for (const direction of [1, 1, -1, -1, -1] as const) {
      stepMatch(direction);
      visited.push([search().active!.page, search().active!.index]);
    }
    expect(visited).toEqual([
      [3, 0],
      [1, 0],
      [3, 0],
      [1, 1],
      [1, 0],
    ]);
    expect(history().back).toEqual([loc(2, 0.5)]);
    expect(scrollTo).toHaveBeenCalledTimes(6);
    history().goBack();
    expect(scrollTo).toHaveBeenLastCalledWith(loc(2, 0.5));
  });

  it('keeps the chosen match as earlier pages stream in', () => {
    vi.useFakeTimers();
    const { index } = openBook([[], [], ['force']]);
    searchBook('force');
    vi.advanceTimersByTime(150);
    chooseMatch({ page: 3, index: 0 });
    index.add(makePage(1, 'force and force'));
    vi.advanceTimersByTime(150);
    expect(search()).toMatchObject({ active: { page: 3, index: 0 }, hits: 3 });
    stepMatch(1);
    expect(search().active).toEqual({ page: 1, index: 0 });
  });

  it('does nothing without a chosen match', async () => {
    const { scrollTo } = openBook(BOOK);
    searchBook('force');
    await vi.waitFor(() => expect(search().hits).toBe(3));
    stepMatch(1);
    expect(search().active).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('lands the match a third of the way down the viewport', async () => {
    const viewport = document.createElement('div');
    viewport.className = 'reader__viewport';
    Object.defineProperty(viewport, 'clientHeight', { value: 600 });
    document.body.append(viewport);

    const lines = Array.from({ length: 40 }, (_, i) => (i === 30 ? 'the force' : 'filler'));
    const { scrollTo } = openBook([lines], loc(1, 0));
    searchBook('force');
    await vi.waitFor(() => expect(search().hits).toBe(1));
    chooseMatch({ page: 1, index: 0 });
    const [result] = search().results;
    const top = rangeRects(result.text, result.matches[0].start, result.matches[0].end)[0].y;
    expect(top).toBeGreaterThan(0.5);
    // The page is 1000px tall in the mock and the viewport 600px: a third of it is 0.2 of the page.
    const [target] = scrollTo.mock.calls[0] as [ReadingLocation];
    expect(target.page).toBe(1);
    expect(target.offset).toBeCloseTo(top - 0.2, 6);
  });
});
