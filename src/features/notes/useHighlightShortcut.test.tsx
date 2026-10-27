import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import * as actions from './highlightActions';
import { isHighlightShortcut, useHighlightShortcut } from './useHighlightShortcut';

function Host() {
  useHighlightShortcut();
  return <input aria-label="Typing" />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('isHighlightShortcut', () => {
  const press = (init: Partial<Parameters<typeof isHighlightShortcut>[0]> = {}) =>
    isHighlightShortcut({
      key: 'h',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      ...init,
    });

  it('accepts a bare H in either case', () => {
    expect(press()).toBe(true);
    expect(press({ key: 'H' })).toBe(true);
  });

  it('rejects modified, repeated and other keys', () => {
    expect(press({ ctrlKey: true })).toBe(false);
    expect(press({ metaKey: true })).toBe(false);
    expect(press({ altKey: true })).toBe(false);
    expect(press({ shiftKey: true })).toBe(false);
    expect(press({ repeat: true })).toBe(false);
    expect(press({ key: 'j' })).toBe(false);
  });
});

describe('useHighlightShortcut', () => {
  let highlight: MockInstance<typeof actions.highlightSelection>;
  beforeEach(() => {
    highlight = vi.spyOn(actions, 'highlightSelection');
  });

  it('highlights the selection and swallows the key when it worked', () => {
    highlight.mockReturnValue(true);
    render(<Host />);
    const event = new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(highlight).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the key alone when there is nothing to highlight', () => {
    highlight.mockReturnValue(false);
    render(<Host />);
    const event = new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores H while typing in a field', () => {
    highlight.mockReturnValue(true);
    const { getByLabelText } = render(<Host />);
    fireEvent.keyDown(getByLabelText('Typing'), { key: 'h' });
    expect(highlight).not.toHaveBeenCalled();
  });

  it('ignores modified H and key repeat', () => {
    highlight.mockReturnValue(true);
    render(<Host />);
    fireEvent.keyDown(document.body, { key: 'h', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'h', repeat: true });
    expect(highlight).not.toHaveBeenCalled();
  });

  it('stops listening when unmounted', () => {
    highlight.mockReturnValue(true);
    const { unmount } = render(<Host />);
    unmount();
    fireEvent.keyDown(document.body, { key: 'h' });
    expect(highlight).not.toHaveBeenCalled();
  });
});
