import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ViewerController, useReaderStore } from '../reader/readerStore';
import { FocusMode } from './FocusMode';
import { exitFocusMode, toggleFocusMode, useFocusStore } from './focusStore';
import { ReadingRuler } from './ReadingRuler';

const html = document.documentElement;
const spotlight = () =>
  document.adoptedStyleSheets
    .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
    .join('\n') || undefined;

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

describe('FocusMode', () => {
  it('marks <html> and closes the sidebar, then puts both back, leaving a closed sidebar closed', () => {
    render(<FocusMode />);
    act(() => toggleFocusMode());
    expect(html.classList.contains('focus-mode')).toBe(true);
    expect(useReaderStore.getState().sidebarOpen).toBe(false);

    act(() => exitFocusMode());
    expect(html.classList.contains('focus-mode')).toBe(false);
    expect(useReaderStore.getState().sidebarOpen).toBe(true);

    useReaderStore.setState({ sidebarOpen: false });
    act(() => toggleFocusMode());
    act(() => exitFocusMode());
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
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('spotlights the page at the centre of the viewport, and follows it', () => {
    render(<FocusMode />);
    act(() => toggleFocusMode());
    expect(spotlight()).toContain('[data-page="7"]');

    act(() => useReaderStore.setState({ controller: controllerAt(8), location: { page: 8, offset: 0.1 } }));
    expect(spotlight()).toContain('[data-page="8"]');
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

    move(100);
    move(4);
    expect(html.classList.contains('focus-toolbar')).toBe(true);

    move(100);
    act(() => vi.advanceTimersByTime(500));
    expect(html.classList.contains('focus-toolbar')).toBe(false);
  });
});

describe('ReadingRuler', () => {
  it('is sized to the zoom level and follows the pointer, but not a finger', async () => {
    vi.useFakeTimers();
    useReaderStore.setState({ zoom: { mode: 'custom', scale: 2 } });
    const { container } = render(
      <main aria-label="Document">
        <div className="reader__viewport" />
        <ReadingRuler />
      </main>,
    );
    const main = container.firstElementChild!;
    const ruler = container.querySelector<HTMLElement>('.reading-ruler')!;
    expect(ruler.style.getPropertyValue('--ruler-band')).toBe('76px');

    fireEvent.pointerMove(main, { clientY: 240, pointerType: 'mouse' });
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(ruler.style.getPropertyValue('--ruler-y')).toBe('240px');

    fireEvent.pointerMove(main, { clientY: 500, pointerType: 'touch' });
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(ruler.style.getPropertyValue('--ruler-y')).toBe('240px');
    useReaderStore.setState({ zoom: { mode: 'fit-width', scale: 1 } });
  });
});
