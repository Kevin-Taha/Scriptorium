/**
 * Pure geometry for link peeks: which part of the destination page to show,
 * how large the whole-page view is, and where the card goes next to the link.
 * All lengths are CSS pixels; page sizes are unscaled PDF units.
 */
import { clamp } from '@/lib/util';
import type { Size } from './viewerLayout';

/** Width of the page image in a peek card. */
export const PEEK_WIDTH = 420;
/** Height an excerpt aims for (it never shows less than `MIN_EXCERPT_FRACTION` of the page). */
export const PEEK_EXCERPT_HEIGHT = 280;
/** Largest height of the whole-page view. */
export const PEEK_PAGE_MAX_HEIGHT = 560;
const MIN_EXCERPT_FRACTION = 0.4;
/** The excerpt starts this far (fraction of the page height) above the destination. */
const EXCERPT_LEAD = 0.02;

export interface Excerpt {
  /** Height of the whole page rendered at the peek width. */
  pageHeight: number;
  /** Visible region of that page: distance from its top and height. */
  top: number;
  height: number;
  /** True when the excerpt stops before the end of the page. */
  truncated: boolean;
}

export interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export type PeekSide = 'above' | 'below';

export interface Placement {
  top: number;
  left: number;
  side: PeekSide;
}

/** Height of a page drawn `width` pixels wide, in whole pixels. */
export function peekPageHeight(page: Size, width: number): number {
  return Math.max(1, Math.round((page.height / page.width) * width));
}

/**
 * The region around a destination: it starts slightly above the target's
 * offset (so a heading or figure top isn't flush with the edge) and is tall
 * enough to hold a typical figure, shifting up near the bottom of the page.
 */
export function excerptFor(page: Size, offset: number, width = PEEK_WIDTH): Excerpt {
  const pageHeight = peekPageHeight(page, width);
  const fraction = Math.min(1, Math.max(MIN_EXCERPT_FRACTION, PEEK_EXCERPT_HEIGHT / pageHeight));
  const height = Math.round(fraction * pageHeight);
  const start = clamp((Number.isFinite(offset) ? offset : 0) - EXCERPT_LEAD, 0, 1);
  const top = Math.round(clamp(start * pageHeight, 0, pageHeight - height));
  return { pageHeight, top, height, truncated: top + height < pageHeight };
}

/** The whole page scaled to fit within `maxWidth` × `maxHeight`. */
export function wholePageSize(page: Size, maxWidth = PEEK_WIDTH, maxHeight = PEEK_PAGE_MAX_HEIGHT): Size {
  const scale = Math.min(maxWidth / page.width, maxHeight / page.height);
  return { width: Math.round(page.width * scale), height: Math.round(page.height * scale) };
}

/**
 * Places a card of `size` next to `anchor` inside `bounds`: on the preferred
 * side if it fits there, otherwise on the other side, otherwise on the roomier
 * side clamped into view. Horizontally it lines up with the anchor's left edge.
 */
export function placePeek(
  anchor: Box,
  size: Size,
  bounds: Box,
  { gap = 8, prefer = 'below' as PeekSide } = {},
): Placement {
  const spaceBelow = bounds.bottom - anchor.bottom - gap;
  const spaceAbove = anchor.top - bounds.top - gap;
  const fits = (side: PeekSide) => size.height <= (side === 'below' ? spaceBelow : spaceAbove);
  const other: PeekSide = prefer === 'below' ? 'above' : 'below';
  const side = fits(prefer) ? prefer : fits(other) ? other : spaceBelow >= spaceAbove ? 'below' : 'above';
  const top = side === 'below' ? anchor.bottom + gap : anchor.top - gap - size.height;
  return {
    top: Math.round(clamp(top, bounds.top, Math.max(bounds.top, bounds.bottom - size.height))),
    left: Math.round(clamp(anchor.left, bounds.left, Math.max(bounds.left, bounds.right - size.width))),
    side,
  };
}
