import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderStore } from '../reader/readerStore';
import { SEARCH_INPUT_ID } from './searchDom';
import { useSearchStore } from './searchStore';
import { resolveSearchShortcut, useSearchShortcut } from './useSearchShortcut';

const key = (key: string, extra: Partial<KeyboardEventInit> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});
const idle = { typing: false, inSearchField: false, hasQuery: true };

describe('resolveSearchShortcut', () => {
  it('opens search with Ctrl/Cmd+F, even while typing elsewhere', () => {
    expect(resolveSearchShortcut(key('f', { ctrlKey: true }), idle)).toBe('open');
    expect(resolveSearchShortcut(key('F', { metaKey: true }), idle)).toBe('open');
    expect(resolveSearchShortcut(key('f', { ctrlKey: true }), { ...idle, typing: true })).toBe('open');
    expect(resolveSearchShortcut(key('f', { ctrlKey: true, altKey: true }), idle)).toBeNull();
  });

  it('opens search with / only when not typing', () => {
    expect(resolveSearchShortcut(key('/'), idle)).toBe('open');
    expect(resolveSearchShortcut(key('/'), { ...idle, typing: true })).toBeNull();
    expect(resolveSearchShortcut(key('/', { shiftKey: true }), idle)).toBeNull();
    expect(resolveSearchShortcut(key('/', { ctrlKey: true }), idle)).toBeNull();
  });

  it('steps with F3 and Ctrl+G, backwards with Shift, but only with a query', () => {
    expect(resolveSearchShortcut(key('F3'), idle)).toBe('next');
    expect(resolveSearchShortcut(key('F3', { shiftKey: true }), idle)).toBe('prev');
    expect(resolveSearchShortcut(key('g', { ctrlKey: true }), idle)).toBe('next');
    expect(resolveSearchShortcut(key('G', { metaKey: true, shiftKey: true }), idle)).toBe('prev');
    expect(resolveSearchShortcut(key('F3'), { ...idle, hasQuery: false })).toBeNull();
    expect(resolveSearchShortcut(key('g'), idle)).toBeNull();
  });

  it('steps from inside the search field but not from other text fields', () => {
    expect(resolveSearchShortcut(key('F3'), { ...idle, typing: true, inSearchField: true })).toBe('next');
    expect(resolveSearchShortcut(key('F3'), { ...idle, typing: true })).toBeNull();
    expect(resolveSearchShortcut(key('g', { ctrlKey: true }), { ...idle, typing: true })).toBeNull();
  });
});

describe('useSearchShortcut', () => {
  const next = vi.fn();
  const prev = vi.fn();

  function press(init: KeyboardEventInit & { key: string }, target: EventTarget = document.body) {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    useReaderStore.setState({ sidebarOpen: false, sidebarTab: 'contents' });
    useSearchStore.setState({ query: '', next, prev });
    renderHook(() => useSearchShortcut());
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    next.mockClear();
    prev.mockClear();
  });

  it('opens the sidebar on the search tab, focuses and selects the field, and blocks the browser', () => {
    const input = document.createElement('input');
    input.id = SEARCH_INPUT_ID;
    input.value = 'old query';
    document.body.append(input);

    const event = press({ key: 'f', ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(useReaderStore.getState()).toMatchObject({ sidebarOpen: true, sidebarTab: 'search' });
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('old query'.length);
  });

  it('waits for the panel to mount when the field is not there yet', async () => {
    press({ key: 'f', metaKey: true });
    const input = document.createElement('input');
    input.id = SEARCH_INPUT_ID;
    document.body.append(input);
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('works from other text fields for Ctrl+F but ignores / and F3 there', () => {
    useSearchStore.setState({ query: 'force' });
    const other = document.createElement('input');
    document.body.append(other);
    other.focus();

    expect(press({ key: '/' }, other).defaultPrevented).toBe(false);
    expect(press({ key: 'F3' }, other).defaultPrevented).toBe(false);
    expect(next).not.toHaveBeenCalled();
    expect(press({ key: 'f', ctrlKey: true }, other).defaultPrevented).toBe(true);
  });

  it('steps through matches while a query is active', () => {
    expect(press({ key: 'F3' }).defaultPrevented).toBe(false);
    useSearchStore.setState({ query: 'force' });
    expect(press({ key: 'F3' }).defaultPrevented).toBe(true);
    press({ key: 'F3', shiftKey: true });
    press({ key: 'g', ctrlKey: true });
    press({ key: 'g', ctrlKey: true, shiftKey: true });
    expect(next).toHaveBeenCalledTimes(2);
    expect(prev).toHaveBeenCalledTimes(2);
  });

  it('opens search with / when not typing', () => {
    press({ key: '/' });
    expect(useReaderStore.getState().sidebarTab).toBe('search');
  });

  it('does nothing while a modal dialog is open', () => {
    const dialog = document.createElement('dialog');
    const query = document.querySelector.bind(document);
    vi.spyOn(document, 'querySelector').mockImplementation((selector: string) =>
      selector === 'dialog:modal' ? dialog : query(selector),
    );
    const event = press({ key: 'f', ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(useReaderStore.getState().sidebarTab).toBe('contents');
    vi.restoreAllMocks();
  });
});
