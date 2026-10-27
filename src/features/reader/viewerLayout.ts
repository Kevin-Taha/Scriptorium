/**
 * Pure layout math for the continuous page view.
 *
 * Pages are stacked vertically in rows (page sheet + margin column). Every
 * position is derived from page sizes and the scale, never from the DOM, so
 * the viewer can virtualize thousands of pages and keep the reader's place
 * exactly when sizes or zoom change. All lengths are CSS pixels.
 */
import type { ReadingLocation } from '@/lib/types';

export interface Size {
  width: number;
  height: number;
}

export interface LayoutMetrics {
  /** Space above the first page. */
  paddingTop: number;
  /** Space below the last page. */
  paddingBottom: number;
  /** Vertical space between consecutive rows. */
  pageGap: number;
  /** Width of the margin column to the right of each sheet. */
  marginWidth: number;
  /** Breathing room on each side of a row in fit modes. */
  sidePadding: number;
  /** Rows wider than the fitted page may use the side padding down to this before overflowing. */
  minSidePadding: number;
  /** Breathing room kept above a location scrolled to the top of the viewport. */
  anchorInset: number;
}

export const DEFAULT_METRICS: LayoutMetrics = {
  paddingTop: 32,
  paddingBottom: 32,
  pageGap: 24,
  marginWidth: 280,
  sidePadding: 24,
  minSidePadding: 0,
  anchorInset: 12,
};

/** Unscaled page sizes (PDF units at scale 1, rotation applied), indexed by `page - 1`. */
export interface PageSizes {
  readonly widths: Float64Array;
  readonly heights: Float64Array;
}

export interface ViewerLayout {
  /** CSS pixels per unscaled page unit. */
  readonly scale: number;
  readonly metrics: LayoutMetrics;
  readonly pageCount: number;
  /** Sheet widths in whole CSS pixels. */
  readonly widths: Float64Array;
  /** Sheet heights in whole CSS pixels. */
  readonly heights: Float64Array;
  /** Top of each row, measured from the top of the scrollable content. */
  readonly tops: Float64Array;
  readonly totalHeight: number;
  /** Width needed by the widest row, with `minSidePadding` on each side. */
  readonly contentWidth: number;
}

/** Inclusive, 1-based page range. */
export interface PageRange {
  first: number;
  last: number;
}

export function createPageSizes(sizes: readonly Size[]): PageSizes {
  return {
    widths: Float64Array.from(sizes, (s) => s.width),
    heights: Float64Array.from(sizes, (s) => s.height),
  };
}

export function computeLayout(
  sizes: PageSizes,
  scale: number,
  metrics: LayoutMetrics = DEFAULT_METRICS,
): ViewerLayout {
  const pageCount = sizes.widths.length;
  const widths = new Float64Array(pageCount);
  const heights = new Float64Array(pageCount);
  const tops = new Float64Array(pageCount);
  let y = metrics.paddingTop;
  let maxWidth = 0;
  for (let i = 0; i < pageCount; i++) {
    // Whole pixels keep canvases crisp and match pdf.js's text-layer sizing (round down).
    widths[i] = Math.max(1, Math.floor(sizes.widths[i] * scale));
    heights[i] = Math.max(1, Math.floor(sizes.heights[i] * scale));
    tops[i] = y;
    y += heights[i] + metrics.pageGap;
    maxWidth = Math.max(maxWidth, widths[i]);
  }
  const totalHeight =
    pageCount > 0 ? y - metrics.pageGap + metrics.paddingBottom : metrics.paddingTop + metrics.paddingBottom;
  const contentWidth = maxWidth + metrics.marginWidth + 2 * metrics.minSidePadding;
  return { scale, metrics, pageCount, widths, heights, tops, totalHeight, contentWidth };
}

/** Number of rows whose top is at or above `y` (binary search over the sorted row tops). */
function rowsStartingAtOrBefore(tops: Float64Array, y: number): number {
  let lo = 0;
  let hi = tops.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (tops[mid] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Precise position of content y. Unlike a `ReadingLocation`, the offset is not
 * clamped: the gap above a page yields a small negative offset on that page and
 * space below the last page an offset above 1, so positions round-trip exactly.
 */
export function locate(layout: ViewerLayout, y: number): ReadingLocation {
  const { pageCount, tops, heights } = layout;
  if (pageCount === 0) return { page: 1, offset: 0 };
  let i = rowsStartingAtOrBefore(tops, y) - 1;
  if (i < 0) i = 0;
  else if (i < pageCount - 1 && y >= tops[i] + heights[i]) i += 1;
  return { page: i + 1, offset: (y - tops[i]) / heights[i] };
}

/** Content y of a (possibly unclamped) location. */
export function yOf(layout: ViewerLayout, location: ReadingLocation): number {
  if (layout.pageCount === 0) return 0;
  const i = pageIndex(layout, location.page);
  return layout.tops[i] + location.offset * layout.heights[i];
}

/** Clamps a location to a valid page and an offset within 0..1. */
export function toReadingLocation(location: ReadingLocation, pageCount: number): ReadingLocation {
  const page = Math.min(Math.max(1, Math.round(location.page) || 1), Math.max(1, pageCount));
  const offset = Math.min(1, Math.max(0, Number.isFinite(location.offset) ? location.offset : 0));
  return { page, offset };
}

/** Precise location at the top edge of the viewport (offset by the anchor inset). */
export function anchorAtScrollTop(layout: ViewerLayout, scrollTop: number): ReadingLocation {
  return locate(layout, scrollTop + layout.metrics.anchorInset);
}

/** scrollTop that brings `location` to the top of the viewport. */
export function scrollTopFor(layout: ViewerLayout, location: ReadingLocation): number {
  // The very start of the book shows the full top padding rather than the inset.
  if (location.page <= 1 && location.offset <= 0) return 0;
  return Math.max(0, yOf(layout, location) - layout.metrics.anchorInset);
}

/** Pages intersecting the content band [top, bottom). Never empty when there are pages. */
export function pagesInBand(layout: ViewerLayout, top: number, bottom: number): PageRange {
  const { pageCount, tops, heights } = layout;
  if (pageCount === 0) return { first: 1, last: 0 };
  // First page whose bottom edge is below `top`.
  let lo = 0;
  let hi = pageCount;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (tops[mid] + heights[mid] <= top) lo = mid + 1;
    else hi = mid;
  }
  const first = Math.min(lo, pageCount - 1);
  // Last page whose top edge is above `bottom`.
  let last = rowsStartingAtOrBefore(tops, bottom) - 1;
  if (last > 0 && tops[last] >= bottom) last -= 1;
  return { first: first + 1, last: Math.max(first, last) + 1 };
}

/** Pages within `overscan` viewport heights above and below the viewport. */
export function pagesAroundViewport(
  layout: ViewerLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): PageRange {
  return pagesInBand(
    layout,
    scrollTop - overscan * viewportHeight,
    scrollTop + (1 + overscan) * viewportHeight,
  );
}

export function rangeContains(outer: PageRange, inner: PageRange): boolean {
  return outer.first <= inner.first && outer.last >= inner.last;
}

/**
 * Orders the pages of `range` for rendering: visible pages first (most visible
 * first), then the rest by distance from the viewport, pages below winning ties.
 */
export function renderOrder(layout: ViewerLayout, top: number, bottom: number, range: PageRange): number[] {
  const entries: { page: number; visible: number; distance: number }[] = [];
  for (let page = range.first; page <= range.last; page++) {
    const i = page - 1;
    const pageTop = layout.tops[i];
    const pageBottom = pageTop + layout.heights[i];
    const visible = Math.max(0, Math.min(bottom, pageBottom) - Math.max(top, pageTop));
    const distance = pageTop >= bottom ? pageTop - bottom : pageBottom <= top ? top - pageBottom : 0;
    entries.push({ page, visible, distance });
  }
  entries.sort((a, b) => {
    if (a.visible > 0 || b.visible > 0) return b.visible - a.visible || a.page - b.page;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return b.page - a.page;
  });
  return entries.map((e) => e.page);
}

/** Width of the scrollable content: the viewport, or the widest row if that is wider. */
export function containerWidth(layout: ViewerLayout, viewportWidth: number): number {
  return Math.max(viewportWidth, layout.contentWidth);
}

/** Left edge of a row (sheet + margin) centred in a container, in whole pixels. */
export function rowLeft(layout: ViewerLayout, page: number, containerWidth: number): number {
  const rowWidth = layout.widths[pageIndex(layout, page)] + layout.metrics.marginWidth;
  return Math.max(layout.metrics.minSidePadding, Math.floor((containerWidth - rowWidth) / 2));
}

/** Rendered size of a page in CSS px, or null if the page does not exist. */
export function pageSize(layout: ViewerLayout, page: number): Size | null {
  if (!Number.isInteger(page) || page < 1 || page > layout.pageCount) return null;
  return { width: layout.widths[page - 1], height: layout.heights[page - 1] };
}

/**
 * Scale (CSS px per unscaled page unit) at which `page` fits the viewport.
 * `fit-width` fits the sheet plus its margin column between the side paddings;
 * `fit-page` additionally fits the whole page height (with the anchor inset
 * above and below). May be ≤ 0 for tiny viewports; callers clamp.
 */
export function fitScale(
  mode: 'fit-width' | 'fit-page',
  page: Size,
  viewport: Size,
  metrics: LayoutMetrics = DEFAULT_METRICS,
): number {
  const widthScale = (viewport.width - 2 * metrics.sidePadding - metrics.marginWidth) / page.width;
  if (mode === 'fit-width') return widthScale;
  const heightScale = (viewport.height - 2 * metrics.anchorInset) / page.height;
  return Math.min(widthScale, heightScale);
}

/**
 * Wheel events from a classic mouse wheel arrive in large notches (or lines),
 * whereas trackpad pinches send many small pixel deltas.
 */
export function isWheelNotch(deltaY: number, deltaMode: number): boolean {
  return deltaMode !== 0 || Math.abs(deltaY) >= 50;
}

/** Continuous zoom factor for a pinch (ctrl + wheel) delta in pixels. */
export function pinchZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY / 100);
}

function pageIndex(layout: ViewerLayout, page: number): number {
  return Math.min(Math.max(1, Math.round(page) || 1), layout.pageCount) - 1;
}
