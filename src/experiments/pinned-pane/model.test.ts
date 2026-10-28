import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_PINS,
  activate,
  activePin,
  emptyState,
  loadState,
  parseState,
  pinHeading,
  pinPage,
  saveState,
  stepPin,
  storageKey,
  unpin,
  type PaneState,
} from './model';

function pinned(...pages: number[]): PaneState {
  let state = emptyState();
  pages.forEach((page, index) => {
    state = pinPage(state, { page, offset: 0 }, `id${index}`).state;
  });
  return state;
}

describe('pinning', () => {
  it('adds pins, activating the newest and un-minimising the pane', () => {
    const start = { ...emptyState(), minimised: true };
    const { state, outcome, pin } = pinPage(start, { page: 21, offset: 0.4, title: 'Figure 2.1' }, 'a');
    expect(outcome).toBe('added');
    expect(pin).toEqual({ id: 'a', page: 21, offset: 0.4, title: 'Figure 2.1' });
    expect(state.activeId).toBe('a');
    expect(state.minimised).toBe(false);
  });

  it('focuses an existing pin for the same page instead of duplicating it', () => {
    const base = pinned(21, 35);
    const { state, outcome } = pinPage(base, { page: 21, offset: 0.6, title: 'Table 1' }, 'new');
    expect(outcome).toBe('focused');
    expect(state.pins).toHaveLength(2);
    expect(state.activeId).toBe('id0');
    expect(state.pins[0]).toMatchObject({ page: 21, offset: 0.6, title: 'Table 1' });
  });

  it('keeps an existing title when re-pinned without one', () => {
    const base = pinPage(emptyState(), { page: 7, offset: 0.2, title: 'Figure 1.1' }, 'a').state;
    const { state } = pinPage(base, { page: 7, offset: 0.2 }, 'b');
    expect(state.pins[0].title).toBe('Figure 1.1');
  });

  it('refuses a pin beyond the limit', () => {
    const full = pinned(1, 2, 3, 4, 5);
    expect(full.pins).toHaveLength(MAX_PINS);
    const result = pinPage(full, { page: 6, offset: 0 }, 'x');
    expect(result.outcome).toBe('full');
    expect(result.state).toBe(full);
  });

  it('clamps offsets into the page', () => {
    expect(pinPage(emptyState(), { page: 1, offset: 4 }, 'a').pin?.offset).toBe(1);
    expect(pinPage(emptyState(), { page: 1, offset: Number.NaN }, 'a').pin?.offset).toBe(0);
  });
});

describe('unpinning and stepping', () => {
  it('moves the active pin to a neighbour when it is removed', () => {
    const base = activate(pinned(10, 20, 30), 'id1');
    expect(unpin(base, 'id1').activeId).toBe('id2');
    expect(unpin(activate(base, 'id2'), 'id2').activeId).toBe('id1');
    expect(unpin(activate(base, 'id0'), 'id1').activeId).toBe('id0');
    expect(unpin(pinned(10), 'id0').activeId).toBeNull();
  });

  it('steps the page within the book and drops the old title', () => {
    const base = pinPage(emptyState(), { page: 2, offset: 0.5, title: 'Figure 1.1' }, 'a').state;
    expect(stepPin(base, 'a', 1, 36).pins[0]).toEqual({ id: 'a', page: 3, offset: 0 });
    expect(stepPin(base, 'a', -5, 36).pins[0].page).toBe(1);
    expect(stepPin(base, 'a', 99, 3).pins[0].page).toBe(3);
  });

  it('falls back to the first pin when the active id is unknown', () => {
    expect(activePin({ ...pinned(4, 9), activeId: 'gone' })?.page).toBe(4);
    expect(activePin(emptyState())).toBeNull();
  });
});

describe('headings', () => {
  it('prefers the pin title, then the section', () => {
    const pin = { id: 'a', page: 21, offset: 0 };
    expect(pinHeading({ ...pin, title: 'Figure 2.1' }, '21', 'Newton')).toBe('Figure 2.1 · p. 21');
    expect(pinHeading(pin, '21', 'Newton')).toBe('Newton · p. 21');
    expect(pinHeading(pin, 'xii', null)).toBe('p. xii');
  });
});

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage per book', () => {
    const state = {
      ...pinned(21, 35),
      minimised: true,
      layout: { right: 40, bottom: 30, width: 300, height: 260 },
    };
    saveState('book-a', state);
    expect(localStorage.getItem(storageKey('book-a'))).toContain('"page":21');
    expect(loadState('book-a')).toEqual(state);
    expect(loadState('book-b')).toEqual(emptyState());
  });

  it('does not leave an entry behind for an untouched empty pane', () => {
    saveState('book-a', emptyState());
    expect(localStorage.getItem(storageKey('book-a'))).toBeNull();
  });

  it('survives corrupt or hostile data', () => {
    expect(parseState('not json')).toEqual(emptyState());
    expect(parseState('null')).toEqual(emptyState());
    const messy = parseState(
      JSON.stringify({
        pins: [
          { id: 'a', page: 3, offset: 9 },
          { id: 'a', page: 4, offset: 0 },
          { id: 'b', page: 0, offset: 0 },
          { id: 7, page: 2 },
          null,
        ],
        activeId: 'missing',
        layout: { width: 'wide' },
      }),
    );
    expect(messy.pins).toEqual([{ id: 'a', page: 3, offset: 1 }]);
    expect(messy.activeId).toBe('a');
    expect(messy.layout.width).toBe(emptyState().layout.width);
  });

  it('keeps at most the pin limit', () => {
    const pins = Array.from({ length: 9 }, (_, index) => ({ id: `p${index}`, page: index + 1, offset: 0 }));
    expect(parseState(JSON.stringify({ pins })).pins).toHaveLength(MAX_PINS);
  });
});
