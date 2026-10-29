import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dialog from '../navigation/ShortcutsDialog';
import * as reviewFocus from './reviewFocus';
import { useReviewShortcuts } from './useReviewShortcuts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const onExit = vi.fn();
  const onFocusSearch = vi.fn();
  const focusNote = vi.spyOn(reviewFocus, 'focusAdjacentNote').mockImplementation(() => {});
  const openHelp = vi.spyOn(dialog, 'openShortcutsDialog').mockImplementation(() => {});
  renderHook(() => useReviewShortcuts({ onExit, onFocusSearch }));
  return { onExit, onFocusSearch, focusNote, openHelp };
}

describe('useReviewShortcuts', () => {
  it('moves between notes, filters, leaves and opens help', () => {
    const { onExit, onFocusSearch, focusNote, openHelp } = setup();
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'k' });
    expect(focusNote.mock.calls).toEqual([[1], [-1]]);
    fireEvent.keyDown(window, { key: '/' });
    expect(onFocusSearch).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(openHelp).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'R', shiftKey: true });
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('keeps / for the filter on layouts that type it with Shift', () => {
    const { onFocusSearch, openHelp } = setup();
    fireEvent.keyDown(window, { key: '/', shiftKey: true });
    expect(onFocusSearch).toHaveBeenCalledTimes(1);
    expect(openHelp).not.toHaveBeenCalled();
  });

  it('ignores modified keys and keys typed into a field', () => {
    const { onExit, focusNote } = setup();
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    const input = document.body.appendChild(document.createElement('input'));
    fireEvent.keyDown(input, { key: 'Escape' });
    input.remove();
    expect(focusNote).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });
});
