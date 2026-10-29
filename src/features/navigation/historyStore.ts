import { create } from 'zustand';
import type { ReadingLocation } from '@/lib/types';
import { useReaderStore } from '../reader/readerStore';

const MAX_HISTORY = 100;

interface HistoryState {
  back: ReadingLocation[];
  forward: ReadingLocation[];
  /** Where the most recent jump came from; drives the "Return to p. N" pill. */
  returnTarget: ReadingLocation | null;

  /**
   * Navigates to `target` as a deliberate jump (link, outline, bookmark,
   * go-to-page, search result, notes review). The current location is pushed
   * onto the back stack so the reader can return in one action.
   */
  jumpTo(target: ReadingLocation): void;
  /**
   * Records a jump that has already happened (e.g. a scrub along the book map) from
   * `from` to the current place, without scrolling.
   */
  recordJump(from: ReadingLocation): void;
  goBack(): void;
  goForward(): void;
  dismissReturn(): void;
  reset(): void;
}

function currentLocation(): ReadingLocation {
  const { controller, location } = useReaderStore.getState();
  return controller?.getLocation() ?? location;
}

function scrollTo(target: ReadingLocation): void {
  const { controller, setLocation } = useReaderStore.getState();
  if (controller) controller.scrollTo(target);
  else setLocation(target);
}

/** Two locations are "the same place" if they are on the same page and nearly the same offset. */
export function isSamePlace(a: ReadingLocation, b: ReadingLocation): boolean {
  return a.page === b.page && Math.abs(a.offset - b.offset) < 0.05;
}

export const useHistoryStore = create<HistoryState>()((set, get) => {
  /** Remembers `from` as the place a jump left, clearing the forward branch. */
  const leave = (from: ReadingLocation) =>
    set((s) => ({
      back: [...s.back, from].slice(-MAX_HISTORY),
      forward: [],
      returnTarget: from,
    }));

  return {
    back: [],
    forward: [],
    returnTarget: null,

    jumpTo(target) {
      const from = currentLocation();
      if (!isSamePlace(from, target)) leave(from);
      scrollTo(target);
    },

    recordJump(from) {
      if (!isSamePlace(from, currentLocation())) leave(from);
    },

    goBack() {
      const { back } = get();
      const target = back.at(-1);
      if (!target) return;
      const from = currentLocation();
      set((s) => ({
        back: s.back.slice(0, -1),
        forward: [...s.forward, from].slice(-MAX_HISTORY),
        returnTarget: null,
      }));
      scrollTo(target);
    },

    goForward() {
      const { forward } = get();
      const target = forward.at(-1);
      if (!target) return;
      const from = currentLocation();
      set((s) => ({
        forward: s.forward.slice(0, -1),
        back: [...s.back, from].slice(-MAX_HISTORY),
        returnTarget: from,
      }));
      scrollTo(target);
    },

    dismissReturn: () => set({ returnTarget: null }),
    reset: () => set({ back: [], forward: [], returnTarget: null }),
  };
});

useReaderStore.subscribe((state, prev) => {
  if (state.docId !== prev.docId) useHistoryStore.getState().reset();
});
