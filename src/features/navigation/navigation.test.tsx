import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderStore } from '../reader/readerStore';
import { BookmarkRibbon } from './BookmarkRibbon';
import { BookmarkToggle } from './BookmarkToggle';
import { useBookmarksStore } from './bookmarksStore';
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

describe('bookmark indicator', () => {
  it('reflects the current page in the toolbar and renders an accessible-hidden ribbon', () => {
    useBookmarksStore.setState({ docId: 'd', bookmarks: [], loaded: true });
    const { container } = render(
      <>
        <BookmarkToggle />
        <BookmarkRibbon page={1} />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Bookmark page (B)' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.page-sheet__ribbon')).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.page-sheet__ribbon')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.page-sheet__ribbon')).toBeNull();
  });
});

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
