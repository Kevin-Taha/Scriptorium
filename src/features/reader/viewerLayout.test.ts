import { describe, expect, it } from 'vitest';
import {
  DEFAULT_METRICS,
  anchorAtScrollTop,
  computeLayout,
  containerWidth,
  createPageSizes,
  fitScale,
  isWheelNotch,
  locate,
  pageSize,
  pagesAroundViewport,
  pagesInBand,
  pinchZoomFactor,
  rangeContains,
  renderOrder,
  rowLeft,
  scrollTopFor,
  toReadingLocation,
  yOf,
} from './viewerLayout';

const LETTER = { width: 612, height: 792 };
const uniform = (count: number, size = LETTER) => createPageSizes(Array.from({ length: count }, () => size));
const { paddingTop, paddingBottom, pageGap, marginWidth, sidePadding, minSidePadding, anchorInset } =
  DEFAULT_METRICS;

describe('computeLayout', () => {
  it('stacks rows with padding and gaps', () => {
    const layout = computeLayout(uniform(3), 1);
    expect(Array.from(layout.heights)).toEqual([792, 792, 792]);
    expect(Array.from(layout.tops)).toEqual([
      paddingTop,
      paddingTop + 792 + pageGap,
      paddingTop + 2 * (792 + pageGap),
    ]);
    expect(layout.totalHeight).toBe(paddingTop + 3 * 792 + 2 * pageGap + paddingBottom);
    expect(layout.contentWidth).toBe(612 + marginWidth + 2 * minSidePadding);
  });

  it('rounds scaled sizes down to whole pixels', () => {
    const layout = computeLayout(uniform(1), 1.3333);
    expect(layout.widths[0]).toBe(Math.floor(612 * 1.3333));
    expect(layout.heights[0]).toBe(Math.floor(792 * 1.3333));
  });

  it('handles mixed page sizes and rotation-swapped dimensions', () => {
    const sizes = createPageSizes([LETTER, { width: 792, height: 612 }, LETTER]);
    const layout = computeLayout(sizes, 0.5);
    expect(Array.from(layout.widths)).toEqual([306, 396, 306]);
    expect(Array.from(layout.heights)).toEqual([396, 306, 396]);
    expect(layout.tops[2]).toBe(paddingTop + 396 + pageGap + 306 + pageGap);
    expect(layout.contentWidth).toBe(396 + marginWidth + 2 * minSidePadding);
  });

  it('handles an empty document', () => {
    const layout = computeLayout(uniform(0), 1);
    expect(layout.pageCount).toBe(0);
    expect(layout.totalHeight).toBe(paddingTop + paddingBottom);
    expect(locate(layout, 100)).toEqual({ page: 1, offset: 0 });
    expect(yOf(layout, { page: 3, offset: 0.5 })).toBe(0);
  });

  it('stays fast for very long documents', () => {
    const start = performance.now();
    const layout = computeLayout(uniform(5000), 1.25);
    expect(performance.now() - start).toBeLessThan(50);
    expect(layout.tops[4999]).toBe(paddingTop + 4999 * (Math.floor(792 * 1.25) + pageGap));
  });
});

describe('locate / yOf', () => {
  const layout = computeLayout(uniform(10), 1);
  const top = (page: number) => layout.tops[page - 1];

  it('finds the page and fractional offset', () => {
    expect(locate(layout, top(4))).toEqual({ page: 4, offset: 0 });
    expect(locate(layout, top(4) + 396)).toEqual({ page: 4, offset: 0.5 });
  });

  it('assigns the gap above a page to that page with a negative offset', () => {
    const loc = locate(layout, top(5) - 10);
    expect(loc.page).toBe(5);
    expect(loc.offset).toBeCloseTo(-10 / 792);
  });

  it('extends the first and last pages into the document padding', () => {
    expect(locate(layout, 0)).toEqual({ page: 1, offset: -paddingTop / 792 });
    const end = locate(layout, layout.totalHeight);
    expect(end.page).toBe(10);
    expect(end.offset).toBeGreaterThan(1);
  });

  it('round-trips every content position exactly', () => {
    for (let y = 0; y <= layout.totalHeight; y += 37) {
      expect(yOf(layout, locate(layout, y))).toBeCloseTo(y, 6);
    }
  });

  it('clamps out-of-range pages when converting to y', () => {
    expect(yOf(layout, { page: 99, offset: 0 })).toBe(top(10));
    expect(yOf(layout, { page: 0, offset: 0 })).toBe(top(1));
  });
});

describe('scroll positions', () => {
  const layout = computeLayout(uniform(20), 1.2);

  it('leaves room to scroll the last lines clear of the Return pill', () => {
    const viewportHeight = 852;
    const maxScrollTop = layout.totalHeight - viewportHeight;
    const lastPageBottom = layout.tops[19] + layout.heights[19];
    // Return pill: 40px tall, 24px above the bottom edge, plus breathing room.
    expect(paddingBottom).toBeGreaterThanOrEqual(24 + 40 + 24);
    expect(maxScrollTop + viewportHeight - lastPageBottom).toBe(paddingBottom);
    const atEnd = anchorAtScrollTop(layout, maxScrollTop);
    expect(atEnd.page).toBe(20);
    expect(scrollTopFor(layout, atEnd)).toBeCloseTo(maxScrollTop, 6);
  });

  it('keeps the anchor inset above a location at the top of the viewport', () => {
    const scrollTop = scrollTopFor(layout, { page: 7, offset: 0.25 });
    expect(scrollTop).toBeCloseTo(layout.tops[6] + 0.25 * layout.heights[6] - anchorInset);
    const loc = anchorAtScrollTop(layout, scrollTop);
    expect(loc.page).toBe(7);
    expect(loc.offset).toBeCloseTo(0.25);
  });

  it('maps the start of the book to scrollTop 0', () => {
    expect(scrollTopFor(layout, { page: 1, offset: 0 })).toBe(0);
    expect(scrollTopFor(layout, anchorAtScrollTop(layout, 0))).toBe(0);
    expect(toReadingLocation(anchorAtScrollTop(layout, 0), 20)).toEqual({ page: 1, offset: 0 });
  });

  it('round-trips scrollTop → location → scrollTop across the document', () => {
    for (let s = 0; s < layout.totalHeight; s += 113) {
      expect(scrollTopFor(layout, anchorAtScrollTop(layout, s))).toBeCloseTo(s, 6);
    }
  });

  it('round-trips location → scrollTop → location for valid reading locations', () => {
    for (let page = 1; page <= 20; page += 3) {
      for (const offset of [0, 0.1, 0.5, 0.99, 1]) {
        if (page === 1 && offset === 0) continue;
        const loc = anchorAtScrollTop(layout, scrollTopFor(layout, { page, offset }));
        expect(loc.page).toBe(offset === 1 && page < 20 ? page + 1 : page);
        if (!(offset === 1 && page < 20)) expect(loc.offset).toBeCloseTo(offset, 6);
      }
    }
  });

  it('keeps a location anchored when the scale changes', () => {
    const before = anchorAtScrollTop(layout, 5000);
    const zoomed = computeLayout(uniform(20), 2.4);
    const after = anchorAtScrollTop(zoomed, scrollTopFor(zoomed, before));
    expect(after.page).toBe(before.page);
    expect(after.offset).toBeCloseTo(before.offset, 9);
  });

  it('keeps a location anchored when sizes above it change', () => {
    const anchor = anchorAtScrollTop(layout, 9000);
    const sizes = createPageSizes(
      Array.from({ length: 20 }, (_, i) => (i < 3 ? { width: 792, height: 612 } : LETTER)),
    );
    const updated = computeLayout(sizes, 1.2);
    expect(anchorAtScrollTop(updated, scrollTopFor(updated, anchor))).toEqual(anchor);
  });
});

describe('toReadingLocation', () => {
  it('clamps pages and offsets', () => {
    expect(toReadingLocation({ page: 4, offset: -0.02 }, 10)).toEqual({ page: 4, offset: 0 });
    expect(toReadingLocation({ page: 10, offset: 1.3 }, 10)).toEqual({ page: 10, offset: 1 });
    expect(toReadingLocation({ page: 42, offset: 0.5 }, 10)).toEqual({ page: 10, offset: 0.5 });
    expect(toReadingLocation({ page: Number.NaN, offset: Number.NaN }, 10)).toEqual({ page: 1, offset: 0 });
  });
});

describe('pagesInBand', () => {
  const layout = computeLayout(uniform(10), 1);
  const top = (page: number) => layout.tops[page - 1];
  const bottom = (page: number) => top(page) + layout.heights[page - 1];

  it('returns pages intersecting the band', () => {
    expect(pagesInBand(layout, 0, 500)).toEqual({ first: 1, last: 1 });
    expect(pagesInBand(layout, top(3) + 10, top(5) + 1)).toEqual({ first: 3, last: 5 });
  });

  it('excludes pages that only touch the band edges', () => {
    expect(pagesInBand(layout, bottom(2), top(4))).toEqual({ first: 3, last: 3 });
  });

  it('falls back to the next page when the band sits inside a gap', () => {
    expect(pagesInBand(layout, bottom(2) + 2, bottom(2) + 4)).toEqual({ first: 3, last: 3 });
  });

  it('clamps bands beyond the document', () => {
    expect(pagesInBand(layout, -5000, -10)).toEqual({ first: 1, last: 1 });
    expect(pagesInBand(layout, 1e9, 2e9)).toEqual({ first: 10, last: 10 });
    expect(pagesInBand(layout, -1e9, 1e9)).toEqual({ first: 1, last: 10 });
  });

  it('expands around the viewport by whole viewport heights', () => {
    const range = pagesAroundViewport(layout, top(5), 800, 1);
    expect(range).toEqual(pagesInBand(layout, top(5) - 800, top(5) + 1600));
    expect(rangeContains(range, pagesInBand(layout, top(5), top(5) + 800))).toBe(true);
    expect(rangeContains({ first: 3, last: 6 }, { first: 2, last: 4 })).toBe(false);
  });
});

describe('renderOrder', () => {
  const layout = computeLayout(uniform(10), 1);
  const top = (page: number) => layout.tops[page - 1];

  it('renders the most visible page first, then neighbours by distance', () => {
    const viewportTop = top(5) + 600;
    const order = renderOrder(layout, viewportTop, viewportTop + 900, { first: 3, last: 8 });
    expect(order.slice(0, 2)).toEqual([6, 5]);
    expect(order.slice(2)).toEqual([7, 4, 8, 3]);
  });

  it('prefers the page below when distances tie', () => {
    const viewportTop = top(5);
    const order = renderOrder(layout, viewportTop, viewportTop + 792, { first: 4, last: 6 });
    expect(order).toEqual([5, 6, 4]);
  });
});

describe('rowLeft / pageSize', () => {
  const layout = computeLayout(uniform(3), 1);

  it('centres the sheet and margin as one unit on whole pixels', () => {
    expect(rowLeft(layout, 1, 1501)).toBe(Math.floor((1501 - 612 - marginWidth) / 2));
    expect(rowLeft(layout, 1, 600)).toBe(minSidePadding);
  });

  it('scrolls horizontally only when the widest row does not fit', () => {
    expect(containerWidth(layout, 1500)).toBe(1500);
    expect(containerWidth(layout, 600)).toBe(layout.contentWidth);
  });

  it('reports page sizes for valid pages only', () => {
    expect(pageSize(layout, 2)).toEqual({ width: 612, height: 792 });
    expect(pageSize(layout, 0)).toBeNull();
    expect(pageSize(layout, 4)).toBeNull();
    expect(pageSize(layout, 1.5)).toBeNull();
  });
});

describe('fitScale', () => {
  const viewport = { width: 1200, height: 900 };

  it('fits the sheet and margin column to the width', () => {
    const scale = fitScale('fit-width', LETTER, viewport);
    expect(scale).toBeCloseTo((1200 - 2 * sidePadding - marginWidth) / 612);
    const layout = computeLayout(uniform(1), scale);
    expect(layout.contentWidth).toBeLessThanOrEqual(viewport.width);
    expect(rowLeft(layout, 1, viewport.width)).toBe(sidePadding);
  });

  it('tolerates slightly wider pages without overflowing the viewport', () => {
    const scale = fitScale('fit-width', LETTER, viewport);
    const sizes = createPageSizes([LETTER, { width: 612 * 1.02, height: 792 }]);
    const layout = computeLayout(sizes, scale);
    expect(layout.contentWidth).toBeLessThanOrEqual(viewport.width);
    expect(rowLeft(layout, 2, viewport.width)).toBeLessThan(sidePadding);
    expect(rowLeft(layout, 2, viewport.width)).toBeGreaterThanOrEqual(minSidePadding);
  });

  it('fits the whole page for fit-page', () => {
    const scale = fitScale('fit-page', LETTER, viewport);
    expect(scale).toBeCloseTo((900 - 2 * anchorInset) / 792);
    const layout = computeLayout(uniform(1), scale);
    expect(layout.heights[0] + 2 * anchorInset).toBeLessThanOrEqual(viewport.height);
  });

  it('uses the narrower constraint for wide pages in fit-page', () => {
    const landscape = { width: 1584, height: 612 };
    expect(fitScale('fit-page', landscape, viewport)).toBeCloseTo(fitScale('fit-width', landscape, viewport));
  });
});

describe('wheel zoom', () => {
  it('distinguishes mouse-wheel notches from trackpad pinches', () => {
    expect(isWheelNotch(100, 0)).toBe(true);
    expect(isWheelNotch(-120, 0)).toBe(true);
    expect(isWheelNotch(3, 1)).toBe(true);
    expect(isWheelNotch(4.5, 0)).toBe(false);
  });

  it('zooms in for negative deltas and is symmetric', () => {
    expect(pinchZoomFactor(-10)).toBeGreaterThan(1);
    expect(pinchZoomFactor(10)).toBeLessThan(1);
    expect(pinchZoomFactor(-10) * pinchZoomFactor(10)).toBeCloseTo(1);
  });
});
