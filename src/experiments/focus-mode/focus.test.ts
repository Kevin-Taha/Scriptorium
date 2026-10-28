import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useReaderStore, type ViewerController } from '@/features/reader/readerStore';
import { DIMMED_PAGE_OPACITY, REVEAL_ZONE, rulerBandHeight, shouldReveal, spotlightCss } from './focusLogic';
import { CHROME_CLASS, FOCUS_CLASS, useFocusStore } from './focusStore';

describe('focus logic', () => {
  it('scales the ruler band with zoom and keeps it within sensible bounds', () => {
    expect(rulerBandHeight(1)).toBeGreaterThanOrEqual(30);
    expect(rulerBandHeight(2)).toBeGreaterThan(rulerBandHeight(1));
    expect(rulerBandHeight(0.1)).toBe(30);
    expect(rulerBandHeight(10)).toBe(170);
  });

  it('dims every page but the current one', () => {
    const css = spotlightCss(12);
    expect(css).toContain('html.exp-focus');
    expect(css).toContain(':not([data-page="12"])');
    expect(css).toContain(`opacity: ${DIMMED_PAGE_OPACITY}`);
  });

  it('only reveals the toolbar in the top strip, and only once the pointer has been away from it', () => {
    expect(shouldReveal(REVEAL_ZONE, true)).toBe(true);
    expect(shouldReveal(REVEAL_ZONE + 1, true)).toBe(false);
    expect(shouldReveal(4, false)).toBe(false);
  });
});

describe('focus store', () => {
  const location = { page: 7, offset: 0.4 };
  let scrollTo: Mock<ViewerController['scrollTo']>;

  beforeEach(() => {
    scrollTo = vi.fn<ViewerController['scrollTo']>();
    const controller: ViewerController = {
      scrollTo,
      getLocation: () => location,
      getVisibleCenter: () => location,
      getPageSize: () => null,
    };
    useReaderStore.setState({ sidebarOpen: true, controller, docId: 'doc', location });
  });

  afterEach(() => {
    useFocusStore.getState().exit();
    useReaderStore.setState({ controller: null, docId: null });
  });

  it('closes the sidebar on entering and reopens it on leaving', () => {
    useFocusStore.getState().enter();
    expect(document.documentElement.classList.contains(FOCUS_CLASS)).toBe(true);
    expect(useReaderStore.getState().sidebarOpen).toBe(false);
    expect(useFocusStore.getState().active).toBe(true);

    document.documentElement.classList.add(CHROME_CLASS);
    useFocusStore.getState().exit();
    expect(document.documentElement.classList.contains(FOCUS_CLASS)).toBe(false);
    expect(document.documentElement.classList.contains(CHROME_CLASS)).toBe(false);
    expect(useReaderStore.getState().sidebarOpen).toBe(true);
    expect(useFocusStore.getState().active).toBe(false);
  });

  it('leaves a sidebar that was closed beforehand closed', () => {
    useReaderStore.setState({ sidebarOpen: false });
    useFocusStore.getState().toggle();
    useFocusStore.getState().toggle();
    expect(useReaderStore.getState().sidebarOpen).toBe(false);
  });

  it('puts the reading location back after the layout settles', async () => {
    vi.useFakeTimers();
    try {
      useFocusStore.getState().enter();
      // The viewer reports a different location once the layout changed.
      useReaderStore.setState({
        controller: {
          scrollTo,
          getLocation: () => ({ page: 7, offset: 0.9 }),
          getVisibleCenter: () => location,
          getPageSize: () => null,
        },
      });
      await vi.advanceTimersByTimeAsync(200);
      expect(scrollTo).toHaveBeenCalledWith(location, { smooth: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows ruler feedback only while active', () => {
    const store = useFocusStore.getState();
    store.setRuler(false);
    store.toggleRuler();
    expect(useFocusStore.getState().ruler).toBe(true);
    expect(useFocusStore.getState().notice).toBeNull();
    store.enter();
    store.toggleRuler();
    expect(useFocusStore.getState().notice?.kind).toBe('ruler-off');
    useFocusStore.getState().setRuler(false);
  });
});
