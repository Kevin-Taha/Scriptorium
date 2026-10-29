import { clamp } from '@/lib/util';

/** Pointer distance from the top edge (CSS px) that brings the toolbar back; the toolbar's own height. */
export const REVEAL_ZONE = 48;
/** How long the toolbar lingers once the pointer has left the top edge. */
export const HIDE_DELAY_MS = 500;

/**
 * Whether a pointer at `clientY` should bring the toolbar back. `armed` is false right after entering
 * focus mode with the pointer still on the toolbar, so the toolbar doesn't bounce straight back.
 */
export function shouldReveal(clientY: number, armed: boolean): boolean {
  return armed && clientY <= REVEAL_ZONE;
}

/** Rule that dims every page row but `page`, the one at the centre of the viewport. */
export function spotlightRule(page: number): string {
  return `html.focus-mode .reader__page:not([data-page="${page}"]) { opacity: var(--focus-page-opacity); }`;
}

/** Reading ruler band height in CSS px: about two text lines, growing with the zoom level. */
export function rulerBandHeight(zoomScale: number): number {
  return Math.round(clamp(38 * zoomScale, 30, 170));
}
