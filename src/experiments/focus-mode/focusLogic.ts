import { clamp } from '@/lib/util';

/** Pointer distance from the top edge (CSS px) that brings the toolbar back. */
export const REVEAL_ZONE = 48;
/** How long the toolbar lingers after the pointer leaves it. */
export const HIDE_DELAY_MS = 550;
/** Opacity of pages other than the one being read. */
export const DIMMED_PAGE_OPACITY = 0.45;

/** Ruler band height in CSS px: roughly two text lines, growing with the zoom level. */
export function rulerBandHeight(zoomScale: number): number {
  return Math.round(clamp(38 * zoomScale, 30, 170));
}

/** Rule that dims every page row except `page`; kept in a `<style>` element while focus mode is on. */
export function spotlightCss(page: number): string {
  return `html.exp-focus .reader__page:not([data-page="${page}"]) { opacity: ${DIMMED_PAGE_OPACITY}; }`;
}

/** Whether a pointer move at `clientY` should bring the toolbar back (needs to have left the zone once). */
export function shouldReveal(clientY: number, armed: boolean): boolean {
  return armed && clientY <= REVEAL_ZONE;
}

export type FocusNotice = { id: number; kind: 'enter' | 'ruler-on' | 'ruler-off' };

const RULER_KEY = 'scriptorium.exp.focus-mode.ruler';

export function readRulerPreference(): boolean {
  try {
    return localStorage.getItem(RULER_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeRulerPreference(on: boolean): void {
  try {
    localStorage.setItem(RULER_KEY, on ? '1' : '0');
  } catch {
    // Private mode: the preference still applies for this session.
  }
}
