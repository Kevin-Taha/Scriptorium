import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReadingLocation } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore } from '../reader/readerStore';
import { DEFAULT_OPTIONS } from './matcher';
import { SearchHighlights } from './SearchHighlights';
import { SearchPanel } from './SearchPanel';
import { useSearchStore } from './searchStore';
import { makePage } from './testPages';
import { clearTextIndexes, getTextIndex } from './textIndex';

const loc = (page: number, offset = 0): ReadingLocation => ({ page, offset });
const search = () => useSearchStore.getState();

function openBook(pages: string[][]) {
  useReaderStore.setState({ docId: 'book', doc: { pageCount: pages.length } as never });
  const index = getTextIndex('book', pages.length);
  pages.forEach((lines, i) => {
    index.add(makePage(i + 1, ...lines));
  });
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search in book' }), { target: { value } });
  act(() => search().commitQuery());
}

beforeEach(() => {
  clearTextIndexes();
  useReaderStore.setState({
    docId: null,
    doc: null,
    pdf: null,
    controller: null,
    location: loc(1),
    outline: [],
    pageLabels: null,
  });
  useHistoryStore.getState().reset();
  search().reset();
  useSearchStore.setState({ options: DEFAULT_OPTIONS });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe('SearchPanel', () => {
  it('shows a hint with the shortcuts before anything is typed', () => {
    openBook([['text']]);
    render(<SearchPanel />);
    expect(screen.getByRole('heading', { name: 'Search this book' })).toBeTruthy();
    expect(screen.getByText('Next result')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('groups results by page with section and page-label headings', () => {
    openBook([['a force'], ['none'], ['force and force', 'more force'], ['no']]);
    useReaderStore.setState({
      outline: [
        { title: 'Chapter 1', location: loc(1), children: [] },
        { title: '1.2 Dynamics', location: loc(3), children: [] },
      ],
      pageLabels: ['i', 'ii', '1', '2'],
    });
    render(<SearchPanel />);
    typeQuery('force');

    expect(screen.getAllByText('4 results on 2 pages').length).toBeGreaterThan(0);
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['p. iChapter 11', 'p. 11.2 Dynamics3']);
    const group = headings[1].closest('li')!;
    const rows = within(group).getAllByRole('button');
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('mark')?.textContent).toBe('force');
    expect(rows[0].textContent).toBe('force and force more force');
  });

  it('names pages without a printed label and outline by number', () => {
    openBook([['force'], ['force']]);
    render(<SearchPanel />);
    typeQuery('force');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Page 11',
      'Page 21',
    ]);
  });

  it('says so when nothing matches, and offers a hint when strict options are on', () => {
    openBook([['text']]);
    render(<SearchPanel />);
    typeQuery('absent');
    expect(screen.getAllByText('No results for “absent”').length).toBeGreaterThan(0);
    expect(screen.getByText('Check the spelling, or try fewer words.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Match case' }));
    expect(screen.getByText(/Match case or Whole word is on/)).toBeTruthy();
  });

  it('explains that scanned books have no searchable text', () => {
    openBook([[''], ['']]);
    render(<SearchPanel />);
    typeQuery('anything');
    expect(screen.getByRole('heading', { name: 'No searchable text' })).toBeTruthy();
  });

  it('toggles the search options', () => {
    openBook([['Force force']]);
    render(<SearchPanel />);
    typeQuery('force');
    const matchCase = screen.getByRole('button', { name: 'Match case' });
    const wholeWord = screen.getByRole('button', { name: 'Whole word' });
    expect(matchCase.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(matchCase);
    expect(matchCase.getAttribute('aria-pressed')).toBe('true');
    expect(search().hitCount).toBe(1);
    fireEvent.click(wholeWord);
    expect(wholeWord.getAttribute('aria-pressed')).toBe('true');
    expect(search().options).toEqual({ matchCase: true, wholeWord: true });
  });

  it('steps with Enter and Shift+Enter in the field and with the buttons', () => {
    openBook([['force one force two']]);
    render(<SearchPanel />);
    typeQuery('force');
    const field = screen.getByRole('searchbox');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(search().active).toEqual({ page: 1, index: 0 });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(search().active).toEqual({ page: 1, index: 1 });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(search().active).toEqual({ page: 1, index: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Next result' }));
    expect(search().active).toEqual({ page: 1, index: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Previous result' }));
    expect(search().active).toEqual({ page: 1, index: 0 });
    expect(screen.getAllByText('1 of 2 results on 1 page').length).toBeGreaterThan(0);
  });

  it('marks the active result and goes to a result when it is clicked', () => {
    openBook([['force here'], ['force there']]);
    render(<SearchPanel />);
    typeQuery('force');
    const rows = screen.getAllByRole('button').filter((b) => b.classList.contains('search-result'));
    fireEvent.click(rows[1]);
    expect(search().active).toEqual({ page: 2, index: 0 });
    expect(rows[1].classList.contains('is-active')).toBe(true);
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    expect(rows[0].classList.contains('is-active')).toBe(false);
    expect(useReaderStore.getState().location.page).toBe(2);
    expect(useHistoryStore.getState().back).toEqual([loc(1)]);
  });

  it('moves between the field and the results with the arrow keys', () => {
    openBook([['force a'], ['force b']]);
    render(<SearchPanel />);
    typeQuery('force');
    const field = screen.getByRole('searchbox');
    const rows = screen.getAllByRole('button').filter((b) => b.classList.contains('search-result'));

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'End' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: 'ArrowUp' });
    fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(field);
  });

  it('clears on Escape, then returns focus to the document', () => {
    openBook([['force']]);
    const viewport = document.createElement('div');
    viewport.className = 'reader__viewport';
    viewport.tabIndex = 0;
    document.body.append(viewport);
    render(<SearchPanel />);
    typeQuery('force');
    const field = screen.getByRole('searchbox') as HTMLInputElement;
    field.focus();

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field.value).toBe('');
    expect(search().phase).toBe('idle');
    expect(document.activeElement).toBe(field);

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(document.activeElement).toBe(viewport);
  });

  it('clears with the button and keeps the field focused', () => {
    openBook([['force']]);
    render(<SearchPanel />);
    typeQuery('force');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search().query).toBe('');
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('renders a first batch of matches and reveals the rest on request', () => {
    openBook([[Array.from({ length: 450 }, () => 'force').join(' ')]]);
    const { container } = render(<SearchPanel />);
    typeQuery('force');
    const count = () => container.querySelectorAll('.search-result').length;
    expect(count()).toBe(200);
    fireEvent.click(screen.getByRole('button', { name: /Show more \(250 left\)/ }));
    expect(count()).toBe(400);
    fireEvent.click(screen.getByRole('button', { name: /Show more \(50 left\)/ }));
    expect(count()).toBe(450);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });

  describe('with thousands of matches', () => {
    // 30 pages × 100 matches; the number in each snippet's context identifies the match.
    const BIG = Array.from({ length: 30 }, () => [Array.from({ length: 100 }, () => 'force').join(' ')]);

    const rows = (container: HTMLElement) => [...container.querySelectorAll('.search-result')];
    const pagesShown = (container: HTMLElement) =>
      [...container.querySelectorAll('.search-group__page')].map((p) => p.textContent);

    it('mounts only a window around the active match, however deep it is', () => {
      openBook(BIG);
      const { container } = render(<SearchPanel />);
      typeQuery('force');
      expect(rows(container)).toHaveLength(200);
      expect(screen.queryByRole('button', { name: /Show earlier/ })).toBeNull();

      act(() => search().activate({ page: 20, index: 50 })); // flat position 1,950
      expect(search().activeIndex).toBe(1_950);
      expect(rows(container)).toHaveLength(200);
      expect(pagesShown(container)).toEqual(['Page 19', 'Page 20', 'Page 21']);
      expect(container.querySelector('.search-result.is-active')).not.toBeNull();
      screen.getByRole('button', { name: 'Show earlier (1,850 before)' });
      screen.getByRole('button', { name: 'Show more (950 left)' });

      // The page heading still reports every match on the page, though only some are mounted.
      const heading = container.querySelector('.search-group__count');
      expect(heading?.textContent).toBe('100');
    });

    it('keeps the window while stepping inside it and slides it when stepping past an edge', () => {
      openBook(BIG);
      const { container } = render(<SearchPanel />);
      typeQuery('force');
      act(() => search().activate({ page: 10, index: 50 })); // flat position 950
      const first = pagesShown(container)[0];
      for (let i = 0; i < 40; i++) act(() => search().next());
      expect(rows(container)).toHaveLength(200);
      expect(pagesShown(container)[0]).toBe(first);

      for (let i = 0; i < 100; i++) act(() => search().next());
      expect(search().activeIndex).toBe(1_090);
      expect(rows(container)).toHaveLength(200);
      expect(container.querySelector('.search-result.is-active')).not.toBeNull();
    });

    it('shows the end of the list when wrapping backwards from the start', () => {
      openBook(BIG);
      const { container } = render(<SearchPanel />);
      typeQuery('force');
      act(() => search().activate({ page: 1, index: 0 }));
      act(() => search().prev());
      expect(search().activeIndex).toBe(2_999);
      expect(rows(container)).toHaveLength(200);
      expect(pagesShown(container)).toEqual(['Page 29', 'Page 30']);
      expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
      screen.getByRole('button', { name: 'Show earlier (2,800 before)' });
    });

    it('reveals earlier matches on request', () => {
      openBook(BIG);
      const { container } = render(<SearchPanel />);
      typeQuery('force');
      act(() => search().activate({ page: 20, index: 50 }));
      fireEvent.click(screen.getByRole('button', { name: /Show earlier/ }));
      expect(rows(container)).toHaveLength(400);
      screen.getByRole('button', { name: 'Show earlier (1,650 before)' });
      fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
      expect(rows(container)).toHaveLength(600);
    });

    it('moves from the field to the active match and between rows and the window buttons', async () => {
      openBook(BIG);
      const { container } = render(<SearchPanel />);
      typeQuery('force');
      await waitFor(() => expect(search().phase).toBe('done'));
      act(() => search().activate({ page: 20, index: 50 }));
      const field = screen.getByRole('searchbox');
      fireEvent.keyDown(field, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(container.querySelector('.search-result.is-active'));

      const earlier = screen.getByRole('button', { name: /Show earlier/ });
      fireEvent.keyDown(rows(container)[0], { key: 'ArrowUp' });
      expect(document.activeElement).toBe(earlier);
      fireEvent.keyDown(earlier, { key: 'End' });
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Show more/ }));
    });
  });

  it('starts a fresh recording of history when the panel closes', () => {
    openBook([['force'], ['x'], ['force']]);
    const { unmount } = render(<SearchPanel />);
    typeQuery('force');
    act(() => search().next());
    act(() => search().next());
    expect(useHistoryStore.getState().back).toHaveLength(1);
    unmount();
    act(() => search().next());
    expect(useHistoryStore.getState().back).toHaveLength(2);
  });
});

describe('SearchHighlights', () => {
  const size = { width: 612, height: 792 };

  it('draws nothing without a query or on pages without matches', () => {
    openBook([['force'], ['other']]);
    const { container } = render(<SearchHighlights page={1} size={size} />);
    expect(container.firstChild).toBeNull();
    act(() => {
      search().setQuery('force');
      search().commitQuery();
    });
    expect(container.querySelectorAll('.search-highlight')).toHaveLength(1);
    cleanup();
    const other = render(<SearchHighlights page={2} size={size} />);
    expect(other.container.firstChild).toBeNull();
  });

  it('positions highlights as percentages of the page and emphasises the active match', () => {
    openBook([['force one', 'force two']]);
    const { container } = render(<SearchHighlights page={1} size={size} />);
    act(() => {
      search().setQuery('force');
      search().commitQuery();
    });
    const marks = [...container.querySelectorAll<HTMLElement>('.search-highlight')];
    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => mark.style.left.endsWith('%') && mark.style.top.endsWith('%'))).toBe(true);
    expect(marks.some((mark) => mark.classList.contains('is-active'))).toBe(false);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');

    act(() => search().activate({ page: 1, index: 1 }));
    expect(marks[0].classList.contains('is-active')).toBe(false);
    expect(marks[1].classList.contains('is-active')).toBe(true);

    act(() => search().clear());
    expect(container.firstChild).toBeNull();
  });
  it('keeps highlighting after the panel closes', () => {
    openBook([['force one force']]);
    const highlights = render(<SearchHighlights page={1} size={size} />);
    const panel = render(<SearchPanel />);
    typeQuery('force');
    panel.unmount();
    expect(highlights.container.querySelectorAll('.search-highlight')).toHaveLength(2);
  });
});
