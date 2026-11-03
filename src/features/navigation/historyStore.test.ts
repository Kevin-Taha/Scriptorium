import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderStore } from '../reader/readerStore';
import { isSamePlace, useHistoryStore } from './historyStore';

const loc = (page: number, offset = 0) => ({ page, offset });

beforeEach(() => {
  useReaderStore.setState({ docId: null, status: 'idle', controller: null, location: loc(1, 0.3) });
  useHistoryStore.getState().reset();
});

describe('navigation history', () => {
  it('records jumps and returns to exact offsets in back/forward order', () => {
    const history = useHistoryStore.getState();
    history.jumpTo(loc(7, 0.6));
    history.jumpTo(loc(15, 0.2));
    expect(useHistoryStore.getState()).toMatchObject({
      back: [loc(1, 0.3), loc(7, 0.6)],
      forward: [],
      returnTarget: loc(7, 0.6),
    });
    history.goBack();
    expect(useReaderStore.getState().location).toEqual(loc(7, 0.6));
    expect(useHistoryStore.getState().returnTarget).toEqual(loc(1, 0.3));
    history.goBack();
    expect(useReaderStore.getState().location).toEqual(loc(1, 0.3));
    expect(useHistoryStore.getState().returnTarget).toBeNull();
    history.goForward();
    expect(useReaderStore.getState().location).toEqual(loc(7, 0.6));
    expect(useHistoryStore.getState().returnTarget).toEqual(loc(1, 0.3));
    history.goForward();
    expect(useReaderStore.getState().location).toEqual(loc(15, 0.2));
    expect(useHistoryStore.getState().forward).toEqual([]);
  });

  it('returns several jumps at once, keeping the skipped places as forward history', () => {
    const history = useHistoryStore.getState();
    history.jumpTo(loc(5));
    history.jumpTo(loc(9, 0.4));
    history.jumpTo(loc(14));
    history.returnTo(1);
    expect(useReaderStore.getState().location).toEqual(loc(5));
    expect(useHistoryStore.getState()).toMatchObject({
      back: [loc(1, 0.3)],
      forward: [loc(14), loc(9, 0.4)],
      returnTarget: loc(1, 0.3),
    });
    history.goForward();
    expect(useReaderStore.getState().location).toEqual(loc(9, 0.4));
    history.goForward();
    expect(useReaderStore.getState().location).toEqual(loc(14));
    history.returnTo(7);
    expect(useReaderStore.getState().location).toEqual(loc(14));
  });

  it('clears the forward branch on a new jump, but not a same-place jump', () => {
    const history = useHistoryStore.getState();
    history.jumpTo(loc(7));
    history.jumpTo(loc(15));
    history.goBack();
    history.jumpTo(loc(7, 0.02));
    expect(useHistoryStore.getState().back).toEqual([loc(1, 0.3)]);
    expect(useHistoryStore.getState().forward).toEqual([loc(15)]);
    history.jumpTo(loc(20));
    expect(useHistoryStore.getState().forward).toEqual([]);
    expect(useHistoryStore.getState().back).toEqual([loc(1, 0.3), loc(7, 0.02)]);
  });

  it('dismisses the pill without changing history and resets when the document changes', () => {
    const history = useHistoryStore.getState();
    history.jumpTo(loc(3));
    history.dismissReturn();
    expect(useHistoryStore.getState()).toMatchObject({ back: [loc(1, 0.3)], returnTarget: null });
    useReaderStore.setState({ docId: 'other' });
    expect(useHistoryStore.getState()).toMatchObject({ back: [], forward: [], returnTarget: null });
  });

  it('uses the controller position and delegates scrolling when mounted', () => {
    const scrollTo = vi.fn();
    useReaderStore.setState({
      controller: {
        getLocation: () => loc(4, 0.4),
        getVisibleCenter: () => loc(4, 0.6),
        getPageSize: () => null,
        scrollTo,
      },
    });
    useHistoryStore.getState().jumpTo(loc(9, 0.7));
    expect(useHistoryStore.getState().returnTarget).toEqual(loc(4, 0.4));
    expect(scrollTo).toHaveBeenCalledWith(loc(9, 0.7));
  });

  it('records a jump that already happened without scrolling, unless it went nowhere', () => {
    useReaderStore.setState({ location: loc(12, 0.5) });
    const history = useHistoryStore.getState();
    history.recordJump(loc(12, 0.52));
    expect(useHistoryStore.getState().back).toEqual([]);
    history.recordJump(loc(3, 0.1));
    expect(useHistoryStore.getState()).toMatchObject({ back: [loc(3, 0.1)], returnTarget: loc(3, 0.1) });
    expect(useReaderStore.getState().location).toEqual(loc(12, 0.5));
  });

  it('treats nearby offsets on the same page as the same place', () => {
    expect(isSamePlace(loc(1, 0), loc(1, 0.049))).toBe(true);
    expect(isSamePlace(loc(1, 0), loc(1, 0.05))).toBe(false);
    expect(isSamePlace(loc(1, 0), loc(2, 0))).toBe(false);
  });
});
