/** Pure state for the pinned reference pane, and its per-book persistence. */

export const MAX_PINS = 5;
export const STORAGE_PREFIX = 'scriptorium.exp.pinned-pane.';

export interface Pin {
  id: string;
  page: number;
  /** Fraction (0..1) of the page height shown at the top of the pane. */
  offset: number;
  /** What the pin is of ("Figure 2.1"), when known. */
  title?: string;
}

/** Floating pane geometry, anchored to the bottom-right of the reading area. */
export interface PaneLayout {
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PaneState {
  pins: Pin[];
  activeId: string | null;
  layout: PaneLayout;
  minimised: boolean;
  docked: boolean;
  dockWidth: number;
}

export const DEFAULT_LAYOUT: PaneLayout = { right: 16, bottom: 16, width: 360, height: 480 };
export const DEFAULT_DOCK_WIDTH = 380;

export function emptyState(): PaneState {
  return {
    pins: [],
    activeId: null,
    layout: DEFAULT_LAYOUT,
    minimised: false,
    docked: false,
    dockWidth: DEFAULT_DOCK_WIDTH,
  };
}

export interface PinInput {
  page: number;
  offset: number;
  title?: string;
}

export type PinOutcome = 'added' | 'focused' | 'full';

function clampOffset(offset: number): number {
  return Number.isFinite(offset) ? Math.min(1, Math.max(0, offset)) : 0;
}

/**
 * Pins a page. Pinning a page that is already pinned focuses its tab (moving it
 * to the new spot); a sixth pin is refused.
 */
export function pinPage(
  state: PaneState,
  input: PinInput,
  newId: string,
): { state: PaneState; outcome: PinOutcome; pin: Pin | null } {
  const offset = clampOffset(input.offset);
  const existing = state.pins.find((pin) => pin.page === input.page);
  if (existing) {
    const updated: Pin = { ...existing, offset, title: input.title ?? existing.title };
    return {
      state: {
        ...state,
        pins: state.pins.map((pin) => (pin === existing ? updated : pin)),
        activeId: existing.id,
        minimised: false,
      },
      outcome: 'focused',
      pin: updated,
    };
  }
  if (state.pins.length >= MAX_PINS) return { state, outcome: 'full', pin: null };
  const pin: Pin = { id: newId, page: input.page, offset, ...(input.title ? { title: input.title } : {}) };
  return {
    state: { ...state, pins: [...state.pins, pin], activeId: pin.id, minimised: false },
    outcome: 'added',
    pin,
  };
}

export function unpin(state: PaneState, id: string): PaneState {
  const index = state.pins.findIndex((pin) => pin.id === id);
  if (index < 0) return state;
  const pins = state.pins.filter((pin) => pin.id !== id);
  const activeId =
    state.activeId === id ? (pins[Math.min(index, pins.length - 1)]?.id ?? null) : state.activeId;
  return { ...state, pins, activeId };
}

export function activate(state: PaneState, id: string): PaneState {
  return state.pins.some((pin) => pin.id === id) ? { ...state, activeId: id } : state;
}

/** Moves a pin to the neighbouring page; its title described the old page, so it's dropped. */
export function stepPin(state: PaneState, id: string, delta: number, pageCount: number): PaneState {
  return {
    ...state,
    pins: state.pins.map((pin) => {
      if (pin.id !== id) return pin;
      const page = Math.min(pageCount, Math.max(1, pin.page + delta));
      return page === pin.page ? pin : { id: pin.id, page, offset: 0 };
    }),
  };
}

export function activePin(state: PaneState): Pin | null {
  return state.pins.find((pin) => pin.id === state.activeId) ?? state.pins[0] ?? null;
}

// ------------------------------------------------------------- persistence

export function storageKey(docId: string): string {
  return `${STORAGE_PREFIX}${docId}`;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Tolerant parse: anything unreadable falls back to an empty pane. */
export function parseState(raw: string | null): PaneState {
  const fallback = emptyState();
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as Partial<PaneState> | null;
    if (!data || typeof data !== 'object') return fallback;
    const seen = new Set<string>();
    const pins: Pin[] = [];
    for (const item of Array.isArray(data.pins) ? data.pins : []) {
      if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
      const page = Math.round(finite(item.page, 0));
      if (page < 1) continue;
      seen.add(item.id);
      pins.push({
        id: item.id,
        page,
        offset: clampOffset(finite(item.offset, 0)),
        ...(typeof item.title === 'string' && item.title ? { title: item.title.slice(0, 80) } : {}),
      });
      if (pins.length >= MAX_PINS) break;
    }
    const layout = (data.layout ?? {}) as Partial<PaneLayout>;
    return {
      pins,
      activeId: pins.some((pin) => pin.id === data.activeId)
        ? (data.activeId ?? null)
        : (pins[0]?.id ?? null),
      layout: {
        right: finite(layout.right, DEFAULT_LAYOUT.right),
        bottom: finite(layout.bottom, DEFAULT_LAYOUT.bottom),
        width: finite(layout.width, DEFAULT_LAYOUT.width),
        height: finite(layout.height, DEFAULT_LAYOUT.height),
      },
      minimised: data.minimised === true,
      docked: data.docked === true,
      dockWidth: finite(data.dockWidth, DEFAULT_DOCK_WIDTH),
    };
  } catch {
    return fallback;
  }
}

export function loadState(docId: string): PaneState {
  try {
    return parseState(localStorage.getItem(storageKey(docId)));
  } catch {
    return emptyState();
  }
}

export function saveState(docId: string, state: PaneState): void {
  try {
    if (state.pins.length === 0 && !state.docked) {
      // Keep the layout the reader chose, but don't leave an empty pane lying around.
      const { layout, dockWidth } = state;
      const isDefault =
        layout.right === DEFAULT_LAYOUT.right &&
        layout.bottom === DEFAULT_LAYOUT.bottom &&
        layout.width === DEFAULT_LAYOUT.width &&
        layout.height === DEFAULT_LAYOUT.height &&
        dockWidth === DEFAULT_DOCK_WIDTH;
      if (isDefault) {
        localStorage.removeItem(storageKey(docId));
        return;
      }
    }
    localStorage.setItem(storageKey(docId), JSON.stringify(state));
  } catch {
    // Storage full or unavailable: the pane still works for this session.
  }
}

/** The name of a pin ("Figure 2.1", or the section when it has none) and its page reference. */
export function pinParts(
  pin: Pin,
  label: string,
  section: string | null,
): { name: string | null; page: string } {
  return { name: pin.title ?? section, page: `p. ${label}` };
}

/** "Figure 2.1 · p. 21", or "Newton's Laws · p. 21" when the pin has no title of its own. */
export function pinHeading(pin: Pin, label: string, section: string | null): string {
  const { name, page } = pinParts(pin, label, section);
  return [name, page].filter(Boolean).join(' · ');
}
