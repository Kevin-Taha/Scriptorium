import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ViewerController, useReaderStore } from '../reader/readerStore';
import { FocusMode } from './FocusMode';
import { FocusModeButton } from './FocusModeButton';
import { HIDE_DELAY_MS, REVEAL_ZONE } from './focusLogic';
import { exitFocusMode, toggleFocusMode, useFocusStore } from './focusStore';
import { ReadingRuler } from './ReadingRuler';

const html = document.documentElement;
const spotlight = () => document.head.querySelector('style')?.textContent;

function controllerAt(page: number): ViewerController {
  const location = { page, offset: 0.5 };
  return {
    scrollTo: vi.fn(),
    getLocation: () => location,
    getVisibleCenter: () => location,
    getPageSize: () => null,
  };
}

beforeEach(() => {
  useReaderStore.setState({ sidebarOpen: true, controller: controllerAt(7) });
});

afterEach(() => {
  cleanup();
  exitFocusMode();
  useReaderStore.setState({ controller: null, sidebarOpen: true });
  vi.useRealTimers();
});

describe('FocusModeButton', () => {
  it('shows and toggles the state with its shortcut announced', () => {
    render(<FocusModeButton />);
    const button = screen.getByRole('button', { name: 'Focus mode' });
    expect(button.getAttribute('aria-keyshortcuts')).toBe('F');
    expect(button.getAttribute('data-tooltip')).toBe('Focus mode (F)');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);
    expect(useFocusStore.getState().active).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('FocusMode', () => {
  it('marks <html>, closes the sidebar, and puts both back on leaving', () => {
    render(<FocusMode />);
    expect(html.classList.contains('focus-mode')).toBe(false);

    act(() => toggleFocusMode());
    expect(html.classList.contains('focus-mode')).toBe(true);
    expect(useReaderStore.getState().sidebarOpen).toBe(false);

    act(() => exitFocusMode());
    expect(html.classList.contains('focus-mode')).toBe(false);
    expect(useReaderStore.getState().sidebarOpen).toBe(true);
  });

  it('leaves a sidebar that was closed beforehand closed', () => {
    useReaderStore.setState({ sidebarOpen: false });
    render(<FocusMode />);
    act(() => toggleFocusMode());
    act(() => toggleFocusMode());
    expect(useReaderStore.getState().sidebarOpen).toBe(false);
  });

  it('undoes everything when the reader goes away while it is on', () => {
    const { unmount } = render(<FocusMode />);
    act(() => toggleFocusMode());
    expect(spotlight()).toBeDefined();

    unmount();
    expect(html.classList.contains('focus-mode')).toBe(false);
    expect(useFocusStore.getState().active).toBe(false);
    expect(useReaderStore.getState().sidebarOpen).toBe(true);
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('spotlights the page at the centre of the viewport, and follows it', () => {
    render(<FocusMode />);
    act(() => toggleFocusMode());
    expect(spotlight()).toContain('[data-page="7"]');

    act(() => useReaderStore.setState({ controller: controllerAt(8), location: { page: 8, offset: 0.1 } }));
    expect(spotlight()).toContain('[data-page="8"]');

    act(() => exitFocusMode());
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('announces how to get the controls back and how to leave, then steps aside', () => {
    vi.useFakeTimers();
    render(<FocusMode />);
    act(() => toggleFocusMode());
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Move to the top edge for controls');
    expect(status.textContent).toContain('F or Esc to leave');

    act(() => vi.advanceTimersByTime(6000));
    expect(status.textContent).toBe('');
  });

  it('brings the toolbar back from the top edge and lets it go again', () => {
    vi.useFakeTimers();
    render(<FocusMode />);
    act(() => toggleFocusMode());
    const move = (clientY: number) => fireEvent(window, Object.assign(new Event('pointermove'), { clientY }));

    move(REVEAL_ZONE + 100);
    move(4);
    expect(html.classList.contains('focus-toolbar')).toBe(true);

    move(REVEAL_ZONE + 100);
    expect(html.classList.contains('focus-toolbar')).toBe(true);
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS));
    expect(html.classList.contains('focus-toolbar')).toBe(false);

    act(() => exitFocusMode());
    expect(html.classList.contains('focus-toolbar')).toBe(false);
  });
});

describe('ReadingRuler', () => {
  function renderRuler() {
    const view = render(
      <main aria-label="Document">
        <div className="reader__viewport" />
        <ReadingRuler />
      </main>,
    );
    const ruler = view.container.querySelector<HTMLElement>('.reading-ruler')!;
    return { main: view.container.querySelector('main')!, ruler };
  }

  it('is decorative and sized to the zoom level', () => {
    useReaderStore.setState({ zoom: { mode: 'custom', scale: 2 } });
    const { ruler } = renderRuler();
    expect(ruler.getAttribute('aria-hidden')).toBe('true');
    expect(ruler.style.getPropertyValue('--ruler-band')).toBe('76px');
    useReaderStore.setState({ zoom: { mode: 'fit-width', scale: 1 } });
  });

  it('follows the pointer, but not a finger', async () => {
    vi.useFakeTimers();
    const { main, ruler } = renderRuler();

    fireEvent.pointerMove(main, { clientY: 240, pointerType: 'mouse' });
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(ruler.style.getPropertyValue('--ruler-y')).toBe('240px');

    fireEvent.pointerMove(main, { clientY: 500, pointerType: 'touch' });
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(ruler.style.getPropertyValue('--ruler-y')).toBe('240px');
  });
});
