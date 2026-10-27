import type { ReadingLocation } from '@/lib/types';
import { clamp } from '@/lib/util';
import type { PageRenderer } from './pageRenderer';
import {
  anchorAtScrollTop,
  containerWidth,
  locate,
  pageSize,
  pagesAroundViewport,
  rangeContains,
  renderOrder,
  rowLeft,
  scrollTopFor,
  toReadingLocation,
  type PageRange,
  type Size,
  type ViewerLayout,
} from './viewerLayout';

/** Overscan bands, in viewport heights above and below the viewport. */
const RENDER_OVERSCAN = 1; // canvases, text layers and links
const KEEP_OVERSCAN = 1.5; // rendered content survives within this band
export const ROW_OVERSCAN = 3; // rows (sheet placeholders, margins, overlays)
const ROW_MIN_OVERSCAN = 2; // re-centre the rows once they no longer cover this…
const ROW_MAX_OVERSCAN = 5; // …or once they reach beyond this (e.g. after zooming in)

interface ViewportSyncOptions {
  /** Location to restore when the first layout is applied (the store's location). */
  initialLocation(): ReadingLocation;
  /** Reports the top-of-viewport location while the reader scrolls. */
  onLocation(location: ReadingLocation): void;
  /** Asks the view to mount the rows around `anchor`. */
  onRowsStale(anchor: ReadingLocation): void;
}

/**
 * Keeps the scroll container, the reading location and the render windows in
 * sync. The viewport-top position is tracked as a precise anchor (a location
 * whose offset may fall in a gap), so the reader's place survives zoom changes,
 * page-size refinements and resizes without drift.
 */
export class ViewportSync {
  private element: HTMLElement | null = null;
  private layout: ViewerLayout | null = null;
  private rows: PageRange | null = null;
  /** Precise viewport-top anchor; null until the initial location is restored. */
  private anchor: ReadingLocation | null = null;
  /** scrollTop we set ourselves; scroll events landing there keep the anchor as is. */
  private expectedTop: number | null = null;
  /** While content overflows horizontally: the point of the current sheet (fraction of its width) at the viewport's centre. */
  private focusX: number | null = null;
  private frameRequest = 0;

  constructor(
    private readonly renderer: PageRenderer,
    private readonly options: ViewportSyncOptions,
  ) {}

  connect(element: HTMLElement): () => void {
    this.element = element;
    const onScroll = () => {
      if (!this.frameRequest) this.frameRequest = requestAnimationFrame(this.onFrame);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = 0;
      this.element = null;
    };
  }

  /**
   * Called after React commits a layout or row window. The first call restores
   * the initial location; later layout changes re-anchor the scroll position.
   */
  apply(layout: ViewerLayout, rows: PageRange): void {
    const element = this.element;
    if (!element) return;
    const previous = this.layout;
    this.layout = layout;
    this.rows = rows;
    this.renderer.setScale(layout.scale);
    if (!this.anchor) this.anchor = this.options.initialLocation();
    if (layout !== previous) {
      // If the reader scrolled since the last frame, anchor to what is on screen right now
      // (unless the new, shorter content has already clamped the scroll position).
      const top = element.scrollTop;
      const clamped = top >= element.scrollHeight - element.clientHeight - 1;
      if (previous && !clamped && !this.isOwnScrollPosition(top)) {
        this.anchor = anchorAtScrollTop(previous, top);
      }
      this.scrollToAnchor(element, layout, this.anchor);
      if (element.scrollWidth > element.clientWidth) {
        // Keep the same point of the page centred; content that just started overflowing centres the sheet.
        const sheet = this.sheetSpan(layout, element.clientWidth);
        element.scrollLeft = sheet.left + (this.focusX ?? 0.5) * sheet.width - element.clientWidth / 2;
      }
    }
    this.refreshWindows(element.scrollTop, element.clientHeight);
  }

  scrollTo(location: ReadingLocation, options?: { smooth?: boolean }): void {
    const { element, layout } = this;
    if (!element || !layout || !this.anchor) {
      // Not laid out yet: the location is restored once it is.
      this.options.onLocation(location);
      return;
    }
    const target = toReadingLocation(location, layout.pageCount);
    const top = scrollTopFor(layout, target);
    const reachable = clamp(top, 0, element.scrollHeight - element.clientHeight);
    const smooth =
      options?.smooth !== false &&
      Math.abs(reachable - element.scrollTop) <= element.clientHeight &&
      !prefersReducedMotion();
    if (smooth) {
      this.expectedTop = null;
      element.scrollTo({ top: reachable, behavior: 'smooth' });
      return;
    }
    this.anchor = target;
    this.scrollToAnchor(element, layout, target);
    this.refreshWindows(element.scrollTop, element.clientHeight);
    this.options.onLocation(target);
  }

  getLocation(): ReadingLocation {
    if (!this.layout || !this.anchor) return this.options.initialLocation();
    return toReadingLocation(this.anchor, this.layout.pageCount);
  }

  getVisibleCenter(): ReadingLocation {
    const { element, layout } = this;
    if (!element || !layout || !this.anchor) return this.options.initialLocation();
    return toReadingLocation(locate(layout, element.scrollTop + element.clientHeight / 2), layout.pageCount);
  }

  getPageSize(page: number): Size | null {
    return this.layout ? pageSize(this.layout, page) : null;
  }

  /** Page at the top of the viewport (the reference page for fit zoom modes). */
  currentPage(): number {
    return (this.anchor ?? this.options.initialLocation()).page;
  }

  private readonly onFrame = () => {
    this.frameRequest = 0;
    const { element, layout } = this;
    if (!element || !layout || !this.anchor) return;
    const { scrollTop: top, clientHeight: height, scrollWidth, clientWidth, scrollLeft } = element;
    if (!this.isOwnScrollPosition(top)) {
      this.expectedTop = null;
      this.anchor = anchorAtScrollTop(layout, top);
    }
    if (scrollWidth > clientWidth) {
      const sheet = this.sheetSpan(layout, clientWidth);
      this.focusX = (scrollLeft + clientWidth / 2 - sheet.left) / sheet.width;
    } else {
      this.focusX = null;
    }
    this.refreshWindows(top, height);
    this.options.onLocation(toReadingLocation(this.anchor, layout.pageCount));
  };

  /** Horizontal extent of the current page's sheet within the scrollable content. */
  private sheetSpan(layout: ViewerLayout, viewportWidth: number): { left: number; width: number } {
    const { page } = toReadingLocation(this.anchor ?? { page: 1, offset: 0 }, layout.pageCount);
    return {
      left: rowLeft(layout, page, containerWidth(layout, viewportWidth)),
      width: layout.widths[page - 1],
    };
  }

  private scrollToAnchor(element: HTMLElement, layout: ViewerLayout, anchor: ReadingLocation): void {
    const top = scrollTopFor(layout, anchor);
    if (Math.abs(element.scrollTop - top) >= 1) element.scrollTop = top;
    this.expectedTop = element.scrollTop;
  }

  /** True while the scroll position is still the one we set (the anchor is then exact). */
  private isOwnScrollPosition(top: number): boolean {
    return this.expectedTop !== null && Math.abs(top - this.expectedTop) < 1;
  }

  private refreshWindows(top: number, height: number): void {
    const { layout, rows } = this;
    if (!layout) return;
    const renderRange = pagesAroundViewport(layout, top, height, RENDER_OVERSCAN);
    this.renderer.setWindow(
      renderOrder(layout, top, top + height, renderRange),
      pagesAroundViewport(layout, top, height, KEEP_OVERSCAN),
    );
    const stale =
      !rows ||
      !rangeContains(rows, pagesAroundViewport(layout, top, height, ROW_MIN_OVERSCAN)) ||
      !rangeContains(pagesAroundViewport(layout, top, height, ROW_MAX_OVERSCAN), rows);
    if (stale) this.options.onRowsStale(anchorAtScrollTop(layout, top));
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
