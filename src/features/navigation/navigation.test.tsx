import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderStore } from '../reader/readerStore';
import { BookmarkRibbon, useRibbonReveal } from './BookmarkRibbon';
import { BookmarksPanel } from './BookmarksPanel';
import { useBookmarksStore } from './bookmarksStore';
import { HistoryButtons } from './HistoryButtons';
import { useHistoryStore } from './historyStore';
import { OutlinePanel } from './OutlinePanel';
import { PageIndicator } from './PageIndicator';
import { ReturnPill } from './ReturnPill';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

beforeEach(() => {
  useReaderStore.setState({
    docId: null,
    status: 'idle',
    controller: null,
    location: { page: 1, offset: 0 },
    doc: {
      id: 'd',
      title: 'Book',
      fileName: 'book.pdf',
      fileSize: 1,
      pageCount: 20,
      addedAt: 0,
      lastOpenedAt: 0,
    },
    outline: [],
    pageLabels: null,
    sidebarOpen: true,
  });
  useHistoryStore.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('page field', () => {
  it('does not clobber editing; validates, navigates and focuses the viewport', () => {
    render(
      <>
        <PageIndicator />
        <div className="reader__viewport" />
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Page number' }) as HTMLInputElement;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '12' } });
    act(() => useReaderStore.getState().setLocation({ page: 3, offset: 0 }));
    expect(field.value).toBe('12');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(useReaderStore.getState().location).toEqual({ page: 12, offset: 0 });
    expect(useHistoryStore.getState().returnTarget).toEqual({ page: 3, offset: 0 });
    expect(document.activeElement?.className).toBe('reader__viewport');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '21' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value).toBe('12');
    expect(useReaderStore.getState().location.page).toBe(12);
    fireEvent.change(field, { target: { value: '4' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field.value).toBe('12');
  });

  it('displays and resolves printed labels, raw indices and invalid input', () => {
    useReaderStore.setState({
      pageLabels: ['i', 'ii', 'iii', 'iv', '1', '2', ...Array.from({ length: 14 }, (_, i) => String(i + 3))],
    });
    render(
      <>
        <PageIndicator />
        <ReturnPill />
        <HistoryButtons />
        <div className="reader__viewport" />
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Page number' }) as HTMLInputElement;
    expect(field.value).toBe('i');
    expect(field.inputMode).toBe('text');
    expect(screen.getByText('(1 of 20)')).toBeTruthy();
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '2' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(useReaderStore.getState().location.page).toBe(6);
    expect(field.value).toBe('2');
    expect(screen.getByText('(6 of 20)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Return to p. i' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Back to page i (Alt+Left)' }).getAttribute('data-tooltip'),
    ).toBe('Back to p. i (Alt+←)');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '#2' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(useReaderStore.getState().location.page).toBe(2);
    expect(field.value).toBe('ii');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'not a page' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value).toBe('ii');
    expect(useReaderStore.getState().location.page).toBe(2);
    act(() => useHistoryStore.getState().goBack());
    expect(
      screen.getByRole('button', { name: 'Forward to page ii (Alt+Right)' }).getAttribute('data-tooltip'),
    ).toBe('Forward to p. ii (Alt+→)');
  });

  it('keeps the normal total when the printed label equals the PDF page index', () => {
    useReaderStore.setState({ pageLabels: ['1', '2'] });
    render(<PageIndicator />);
    const field = screen.getByRole('textbox', { name: 'Page number' }) as HTMLInputElement;
    expect(field.value).toBe('1');
    expect(screen.getByText('/ 20')).toBeTruthy();
  });
});

describe('return pill', () => {
  it('stays for same-page jumps and dismisses after scrolling back from another page', () => {
    render(<ReturnPill />);
    act(() => useHistoryStore.getState().jumpTo({ page: 1, offset: 0.6 }));
    expect(screen.getByRole('button', { name: 'Return to p. 1' })).toBeTruthy();
    act(() => useHistoryStore.getState().jumpTo({ page: 9, offset: 0 }));
    expect(screen.getByRole('button', { name: 'Return to p. 1' })).toBeTruthy();
    act(() => useReaderStore.getState().setLocation({ page: 1, offset: 0.2 }));
    expect(useHistoryStore.getState().returnTarget).toBeNull();
  });

  it('stays up through a chain of returns and offers earlier places in a menu', () => {
    useReaderStore.setState({
      outline: [
        { title: 'Opening', location: { page: 1, offset: 0 }, children: [] },
        { title: 'Middle', location: { page: 6, offset: 0 }, children: [] },
      ],
    });
    render(<ReturnPill />);
    const history = useHistoryStore.getState();
    act(() => history.jumpTo({ page: 4, offset: 0 }));
    act(() => history.jumpTo({ page: 7, offset: 0 }));
    act(() => history.jumpTo({ page: 12, offset: 0 }));
    expect(screen.getByRole('button', { name: 'Return to p. 7' })).toBeTruthy();
    const more = screen.getByRole('button', { name: '2 earlier places' });
    fireEvent.click(more);
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['p. 4Opening', 'p. 1Opening']);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more);

    fireEvent.click(screen.getByRole('button', { name: 'Return to p. 7' }));
    expect(useReaderStore.getState().location.page).toBe(7);
    expect(screen.getByRole('button', { name: 'Return to p. 4' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1 earlier place' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'p. 1 Opening' }));
    expect(useReaderStore.getState().location.page).toBe(1);
    expect(useHistoryStore.getState().returnTarget).toBeNull();
    expect(useHistoryStore.getState().forward).toHaveLength(3);
  });

  it('pauses its 12-second inactivity timeout while hovered or focused', () => {
    vi.useFakeTimers();
    const { container } = render(<ReturnPill />);
    act(() => useHistoryStore.getState().jumpTo({ page: 9, offset: 0 }));
    const region = container.querySelector('.return-pill-region')!;
    fireEvent.mouseEnter(region);
    act(() => vi.advanceTimersByTime(20_000));
    expect(useHistoryStore.getState().returnTarget).toBeTruthy();
    fireEvent.mouseLeave(region);
    fireEvent.focus(screen.getByRole('button', { name: 'Return to p. 1' }));
    act(() => vi.advanceTimersByTime(20_000));
    expect(useHistoryStore.getState().returnTarget).toBeTruthy();
    fireEvent.blur(screen.getByRole('button', { name: 'Return to p. 1' }));
    act(() => vi.advanceTimersByTime(12_000));
    expect(useHistoryStore.getState().returnTarget).toBeNull();
  });

  it('restores focus after choosing an earlier place, even when the menu trigger disappears', () => {
    render(
      <>
        <ReturnPill />
        <div className="reader__viewport" tabIndex={-1} />
      </>,
    );
    const history = useHistoryStore.getState();
    act(() => history.jumpTo({ page: 4, offset: 0 }));
    act(() => history.jumpTo({ page: 7, offset: 0 }));
    act(() => history.jumpTo({ page: 12, offset: 0 }));
    fireEvent.click(screen.getByRole('button', { name: '2 earlier places' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'p. 4' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Return to p. 1' }));

    act(() => history.jumpTo({ page: 12, offset: 0 }));
    fireEvent.click(screen.getByRole('button', { name: '1 earlier place' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'p. 1' }));
    expect(document.activeElement?.className).toBe('reader__viewport');

    vi.useFakeTimers();
    act(() => history.jumpTo({ page: 9, offset: 0 }));
    act(() => vi.advanceTimersByTime(12_000));
    expect(useHistoryStore.getState().returnTarget).toBeNull();
  });
});

describe('outline tree', () => {
  it('implements roving focus, expand/collapse, disabled items and history-aware activation', () => {
    useReaderStore.setState({
      outline: [
        {
          title: 'Chapter',
          location: { page: 2, offset: 0 },
          children: [{ title: 'Section', location: { page: 3, offset: 0.2 }, children: [] }],
        },
        { title: 'Unresolved', location: null, children: [] },
      ],
    });
    render(<OutlinePanel />);
    const chapter = screen.getByText('Chapter').closest('[role=treeitem]') as HTMLElement;
    const section = screen.getByText('Section').closest('[role=treeitem]') as HTMLElement;
    chapter.focus();
    fireEvent.keyDown(chapter, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(section);
    fireEvent.keyDown(section, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(chapter);
    fireEvent.keyDown(chapter, { key: 'ArrowLeft' });
    expect(chapter.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(chapter, { key: 'ArrowRight' });
    expect(chapter.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(chapter, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toContain('Section');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement?.textContent).toContain('Unresolved');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(chapter);
    fireEvent.keyDown(chapter, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(useReaderStore.getState().location).toEqual({ page: 3, offset: 0.2 });
    expect(useHistoryStore.getState().returnTarget).toEqual({ page: 1, offset: 0 });
    expect(screen.getByText('Unresolved').closest('[role=treeitem]')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
  });
});

describe('printed labels in navigation', () => {
  it('shows printed labels in outline and bookmark pages and actions', () => {
    useReaderStore.setState({
      pageLabels: ['i', 'ii', '1'],
      outline: [{ title: 'Preface', location: { page: 2, offset: 0 }, children: [] }],
    });
    useBookmarksStore.setState({
      docId: 'd',
      loaded: true,
      bookmarks: [{ id: 'b', docId: 'd', page: 2, label: 'Preface', createdAt: 0 }],
    });
    const { container } = render(
      <>
        <OutlinePanel />
        <BookmarksPanel />
      </>,
    );
    expect(container.querySelector('.outline__page')?.textContent).toBe('ii');
    expect(container.querySelector('.bookmark-list__page')?.textContent).toBe('ii');
    expect(screen.getByRole('button', { name: 'Rename bookmark on page ii' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete bookmark on page ii' })).toBeTruthy();
  });
});

describe('bookmark ribbon', () => {
  it('bookmarks and unbookmarks its own page, labelled by the printed page number', () => {
    useReaderStore.setState({ pageLabels: ['i', 'ii', 'iii'] });
    useBookmarksStore.setState({ docId: 'd', bookmarks: [], loaded: true });
    const { container } = render(<BookmarkRibbon page={2} />);
    const button = screen.getByRole('button', { name: 'Bookmark page ii' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-keyshortcuts')).toBe('B');
    expect(button.getAttribute('data-tooltip')).toBe('Bookmark this page (B)');
    expect(button.tabIndex).toBe(-1);
    expect(container.querySelector('.page-sheet__ribbon')).toBeNull();
    fireEvent.click(button);
    expect(useBookmarksStore.getState().bookmarks.map((b) => b.page)).toEqual([2]);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('data-tooltip')).toBe('Remove bookmark (B)');
    expect(container.querySelector('.page-sheet__ribbon')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(button);
    expect(useBookmarksStore.getState().bookmarks).toEqual([]);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.page-sheet__ribbon')).toBeNull();
  });

  it('reveals the ghost ribbon only near the top-right corner, with no button held', () => {
    const { container } = render(<RibbonRevealHost />);
    const sheet = container.querySelector('.page-sheet')!;
    sheet.getBoundingClientRect = () => ({ top: 0, right: 700, bottom: 800, left: 100 }) as DOMRect;
    const move = (clientX: number, clientY: number, buttons = 0) =>
      fireEvent.pointerMove(sheet.firstChild!, { clientX, clientY, buttons });
    move(650, 30);
    expect(sheet.hasAttribute('data-ribbon-reveal')).toBe(true);
    move(400, 30);
    expect(sheet.hasAttribute('data-ribbon-reveal')).toBe(false);
    move(650, 400);
    expect(sheet.hasAttribute('data-ribbon-reveal')).toBe(false);
    move(650, 30, 1);
    expect(sheet.hasAttribute('data-ribbon-reveal')).toBe(false);
    move(650, 30);
    fireEvent.scroll(document);
    expect(sheet.hasAttribute('data-ribbon-reveal')).toBe(false);
  });
});

function RibbonRevealHost() {
  useRibbonReveal();
  return (
    <div className="page-sheet">
      <span className="text" />
    </div>
  );
}

function ShortcutHost() {
  useKeyboardShortcuts();
  return (
    <>
      <PageIndicator />
      <input aria-label="Editing" />
    </>
  );
}

describe('shortcut integration', () => {
  it('ignores editable and modified keys and dismisses the return control', () => {
    render(<ShortcutHost />);
    const input = screen.getByRole('textbox', { name: 'Editing' });
    fireEvent.keyDown(input, { key: '[' });
    fireEvent.keyDown(window, { key: '[', ctrlKey: true });
    expect(useReaderStore.getState().sidebarOpen).toBe(true);
    fireEvent.keyDown(window, { key: '[' });
    expect(useReaderStore.getState().sidebarOpen).toBe(false);
    act(() => useHistoryStore.getState().jumpTo({ page: 8, offset: 0 }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useHistoryStore.getState().returnTarget).toBeNull();
  });
});
