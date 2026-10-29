import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocusStore } from '../focus/focusStore';
import { useGoToStore } from '../palette/paletteStore';
import { useReaderStore } from '../reader/readerStore';
import { chooseMatch, clearSearch, searchBook, useSearchStore } from './searchStore';
import { makePage } from './testPages';
import { clearTextIndexes, getTextIndex } from './textIndex';
import { useSearchShortcut } from './useSearchShortcut';

function press(init: KeyboardEventInit & { key: string }, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const active = () => useSearchStore.getState().active;

beforeEach(() => {
  clearTextIndexes();
  useReaderStore.setState({ docId: 'book', doc: { pageCount: 2 } as never, pdf: null, controller: null });
  const index = getTextIndex('book', 2);
  index.add(makePage(1, 'force one', 'force two'));
  index.add(makePage(2, 'a force'));
  clearSearch();
  useGoToStore.setState({ open: false });
  useFocusStore.setState({ active: false });
  renderHook(() => useSearchShortcut());
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('useSearchShortcut', () => {
  it('opens Go to with Ctrl/Cmd+F from anywhere, and with / when not typing', () => {
    expect(press({ key: 'f', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(useGoToStore.getState().open).toBe(true);

    useGoToStore.setState({ open: false });
    const field = document.createElement('input');
    document.body.append(field);
    expect(press({ key: '/' }, field).defaultPrevented).toBe(false);
    expect(useGoToStore.getState().open).toBe(false);
    press({ key: 'F', metaKey: true }, field);
    expect(useGoToStore.getState().open).toBe(true);

    useGoToStore.setState({ open: false });
    press({ key: '/' });
    expect(useGoToStore.getState().open).toBe(true);
  });

  it('steps with F3 and Ctrl+G once a match is chosen, and Esc clears the search', () => {
    searchBook('force');
    expect(press({ key: 'F3' }).defaultPrevented).toBe(false);
    chooseMatch({ page: 1, index: 0 });
    press({ key: 'F3' });
    expect(active()).toEqual({ page: 1, index: 1 });
    press({ key: 'g', ctrlKey: true });
    expect(active()).toEqual({ page: 2, index: 0 });
    press({ key: 'F3', shiftKey: true });
    press({ key: 'G', metaKey: true, shiftKey: true });
    expect(active()).toEqual({ page: 1, index: 0 });

    useFocusStore.setState({ active: true });
    expect(press({ key: 'Escape' }).defaultPrevented).toBe(false);
    useFocusStore.setState({ active: false });
    expect(press({ key: 'Escape' }).defaultPrevented).toBe(true);
    expect(useSearchStore.getState()).toMatchObject({ query: '', active: null });
  });

  it('leaves text fields, popovers and modal dialogs alone', () => {
    searchBook('force');
    chooseMatch({ page: 1, index: 0 });
    const field = document.createElement('input');
    document.body.append(field);
    expect(press({ key: 'F3' }, field).defaultPrevented).toBe(false);

    const popover = document.createElement('div');
    document.body.append(popover);
    popover.addEventListener('keydown', (event) => event.preventDefault());
    press({ key: 'Escape' }, popover);
    expect(active()).not.toBeNull();

    const query = document.querySelector.bind(document);
    vi.spyOn(document, 'querySelector').mockImplementation((selector: string) =>
      selector === 'dialog:modal' ? document.createElement('dialog') : query(selector),
    );
    expect(press({ key: 'f', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(useGoToStore.getState().open).toBe(false);
  });
});
