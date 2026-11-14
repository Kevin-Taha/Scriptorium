import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore } from './readerStore';
import { ToolbarMore } from './ToolbarMore';

afterEach(() => {
  cleanup();
  useHistoryStore.getState().reset();
  useReaderStore.setState({ pageLabels: null, location: { page: 1, offset: 0 }, controller: null });
});

describe('ToolbarMore', () => {
  it('shows history targets and note count, and restores focus on choice', () => {
    useReaderStore.setState({ pageLabels: ['i', 'ii', '1', '2'], location: { page: 3, offset: 0 } });
    useHistoryStore.setState({
      back: [{ page: 1, offset: 0 }],
      forward: [{ page: 4, offset: 0 }],
    });
    const onReview = vi.fn();
    render(<ToolbarMore noteCount={3} onReview={onReview} />);

    const trigger = screen.getByRole('button', { name: 'More' });
    fireEvent.click(trigger);

    const back = screen.getByRole('button', { name: 'Back to p. i' });
    const forward = screen.getByRole('button', { name: 'Forward to p. 2' });
    const review = screen.getByRole('button', { name: 'Review notes (3)' });
    expect(back.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowLeft');
    expect(forward.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowRight');
    expect(review.getAttribute('aria-keyshortcuts')).toBe('Shift+R');

    fireEvent.click(review);
    expect(onReview).toHaveBeenCalledOnce();
    expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('stays open when blur drops focus to null (Safari button tap), and closes when focus moves elsewhere', () => {
    render(
      <>
        <ToolbarMore noteCount={0} onReview={() => {}} />
        <button type="button">Outside</button>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'More' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty('disabled', true);

    // Safari clears focus (relatedTarget: null) on mousedown when tapping a button; the menu must remain mounted.
    fireEvent.blur(trigger, { relatedTarget: null });
    expect(screen.getByRole('group', { name: 'More' })).toBeTruthy();

    // Moving focus to another control (e.g. Tab out or opening Go to) closes the menu.
    act(() => screen.getByRole('button', { name: 'Outside' }).focus());
    expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
  });

  it('intercepts Escape even when focus is outside the menu', () => {
    const onWindowKeyDown = vi.fn();
    window.addEventListener('keydown', onWindowKeyDown);
    try {
      render(
        <>
          <ToolbarMore noteCount={0} onReview={() => {}} />
          <button type="button">Viewport</button>
        </>,
      );
      const trigger = screen.getByRole('button', { name: 'More' });
      const viewport = screen.getByRole('button', { name: 'Viewport' });
      viewport.focus();
      fireEvent.click(trigger);
      expect(screen.getByRole('group', { name: 'More' })).toBeTruthy();

      fireEvent.keyDown(viewport, { key: 'Escape' });
      expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(onWindowKeyDown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  });

  it('closes and moves focus off the hidden menu when widening past the phone breakpoint', () => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
          removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => true,
        }) as unknown as MediaQueryList,
    );
    try {
      render(
        <>
          <ToolbarMore noteCount={0} onReview={() => {}} />
          <div className="reader__viewport" tabIndex={-1} />
        </>,
      );
      const trigger = screen.getByRole('button', { name: 'More' });
      fireEvent.click(trigger);
      const review = screen.getByRole('button', { name: 'Review notes (0)' });
      review.focus();
      expect(document.activeElement).toBe(review);

      act(() => {
        for (const cb of listeners) cb({ matches: false } as MediaQueryListEvent);
      });

      expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
      expect(document.activeElement).toBe(document.querySelector('.reader__viewport'));
    } finally {
      matchMediaSpy.mockRestore();
    }
  });
});
