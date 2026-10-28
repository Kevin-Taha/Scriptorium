import { create } from 'zustand';
import { useReaderStore } from '@/features/reader/readerStore';
import type { ReadingLocation } from '@/lib/types';
import { isEditableTarget } from '@/lib/util';
import { type FocusNotice, readRulerPreference, writeRulerPreference } from './focusLogic';

/** On `<html>` while focus mode is on; every rule in focus.css hangs off it. */
export const FOCUS_CLASS = 'exp-focus';
/** On `<html>` while the toolbar is revealed over the page. */
export const CHROME_CLASS = 'exp-focus-chrome';

interface FocusState {
  active: boolean;
  ruler: boolean;
  notice: FocusNotice | null;
  enter(): void;
  exit(): void;
  toggle(): void;
  setRuler(on: boolean): void;
  toggleRuler(): void;
  clearNotice(id: number): void;
}

let sidebarWasOpen = false;
let noticeId = 0;
let cancelRestore: (() => void) | null = null;

const notice = (kind: FocusNotice['kind']): FocusNotice => ({ id: ++noticeId, kind });

/** After the layout changes (toolbar, sidebar, fit-width rescale), puts the reader back where it was. */
function restoreLocation(location: ReadingLocation | null): void {
  cancelRestore?.();
  cancelRestore = null;
  const docId = useReaderStore.getState().docId;
  if (!location || !docId) return;

  const check = () => {
    const { controller, docId: current } = useReaderStore.getState();
    if (!controller || current !== docId) return;
    const now = controller.getLocation();
    if (now.page !== location.page || Math.abs(now.offset - location.offset) > 0.002) {
      controller.scrollTo(location, { smooth: false });
    }
  };

  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(check);
  });
  const timers = [window.setTimeout(check, 140), window.setTimeout(check, 340)];
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const timer of timers) window.clearTimeout(timer);
    for (const type of ['wheel', 'touchmove', 'keydown'] as const) window.removeEventListener(type, stop);
    if (cancelRestore === stop) cancelRestore = null;
  };
  // A reader who starts scrolling meanwhile keeps their own position.
  for (const type of ['wheel', 'touchmove', 'keydown'] as const) {
    window.addEventListener(type, stop, { passive: true });
  }
  window.setTimeout(stop, 400);
  cancelRestore = stop;
}

/**
 * The toolbar button (or a note card that kept focus after editing) would otherwise keep its chrome
 * in view, so focus goes back to the page.
 */
function releaseChromeFocus(): void {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || isEditableTarget(focused)) return;
  if (focused.closest('.reader__toolbar, .margin-note')) {
    document
      .querySelector<HTMLElement>('.reader__viewport')
      ?.focus({ preventScroll: true, focusVisible: false });
  }
}

export const useFocusStore = create<FocusState>()((set, get) => ({
  active: false,
  ruler: readRulerPreference(),
  notice: null,

  enter() {
    if (get().active) return;
    const reader = useReaderStore.getState();
    const location = reader.controller?.getLocation() ?? reader.location;
    sidebarWasOpen = reader.sidebarOpen;
    document.documentElement.classList.add(FOCUS_CLASS);
    set({ active: true, notice: notice('enter') });
    if (sidebarWasOpen) reader.setSidebarOpen(false);
    releaseChromeFocus();
    restoreLocation(location);
  },

  exit() {
    if (!get().active) return;
    const reader = useReaderStore.getState();
    const location = reader.controller?.getLocation() ?? null;
    document.documentElement.classList.remove(FOCUS_CLASS, CHROME_CLASS);
    set({ active: false, notice: null });
    if (sidebarWasOpen && !reader.sidebarOpen) reader.setSidebarOpen(true);
    sidebarWasOpen = false;
    restoreLocation(location);
  },

  toggle() {
    if (get().active) get().exit();
    else get().enter();
  },

  setRuler(on) {
    writeRulerPreference(on);
    set({ ruler: on });
  },

  toggleRuler() {
    const on = !get().ruler;
    get().setRuler(on);
    if (get().active) set({ notice: notice(on ? 'ruler-on' : 'ruler-off') });
  },

  clearNotice(id) {
    if (get().notice?.id === id) set({ notice: null });
  },
}));
