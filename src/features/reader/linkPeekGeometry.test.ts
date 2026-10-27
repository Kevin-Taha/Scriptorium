import { describe, expect, it } from 'vitest';
import {
  PEEK_EXCERPT_HEIGHT,
  PEEK_PAGE_MAX_HEIGHT,
  PEEK_WIDTH,
  excerptFor,
  peekPageHeight,
  placePeek,
  wholePageSize,
  type Box,
} from './linkPeekGeometry';

const LETTER = { width: 612, height: 792 };
const LANDSCAPE = { width: 792, height: 612 };

describe('excerptFor', () => {
  const pageHeight = peekPageHeight(LETTER, PEEK_WIDTH);

  it('renders the page at the peek width', () => {
    expect(pageHeight).toBe(Math.round((792 / 612) * PEEK_WIDTH));
    expect(excerptFor(LETTER, 0).pageHeight).toBe(pageHeight);
  });

  it('starts slightly above the destination', () => {
    const excerpt = excerptFor(LETTER, 0.3);
    expect(excerpt.top).toBe(Math.round(0.28 * pageHeight));
    expect(excerpt.height).toBe(PEEK_EXCERPT_HEIGHT);
    expect(excerpt.truncated).toBe(true);
  });

  it('contains a figure that starts at the destination', () => {
    // Synthetic fixture: Figure 1.1 spans roughly 27%–45% of page 7.
    const excerpt = excerptFor(LETTER, 0.273);
    expect(excerpt.top).toBeLessThanOrEqual(0.27 * pageHeight);
    expect(excerpt.top + excerpt.height).toBeGreaterThanOrEqual(0.45 * pageHeight);
  });

  it('starts at the top for page-top destinations', () => {
    expect(excerptFor(LETTER, 0).top).toBe(0);
    expect(excerptFor(LETTER, 0.01).top).toBe(0);
  });

  it('shifts up near the bottom so it never runs past the page', () => {
    const excerpt = excerptFor(LETTER, 0.95);
    expect(excerpt.top + excerpt.height).toBe(pageHeight);
    expect(excerpt.truncated).toBe(false);
  });

  it('shows at least 40% of short pages and the whole of very short ones', () => {
    const wide = excerptFor(LANDSCAPE, 0.5);
    expect(wide.height).toBeGreaterThanOrEqual(Math.round(0.4 * wide.pageHeight));
    const strip = excerptFor({ width: 612, height: 200 }, 0.5);
    expect(strip.height).toBe(strip.pageHeight);
    expect(strip.top).toBe(0);
  });

  it('tolerates invalid offsets', () => {
    expect(excerptFor(LETTER, Number.NaN).top).toBe(0);
    expect(excerptFor(LETTER, 7).top + excerptFor(LETTER, 7).height).toBe(pageHeight);
  });
});

describe('wholePageSize', () => {
  it('fits the page within the peek box', () => {
    const size = wholePageSize(LETTER);
    expect(size.height).toBeLessThanOrEqual(PEEK_PAGE_MAX_HEIGHT);
    expect(size.width).toBeLessThanOrEqual(PEEK_WIDTH);
    expect(size.width / size.height).toBeCloseTo(612 / 792, 2);
  });

  it('is limited by width for landscape pages and by height for tall ones', () => {
    expect(wholePageSize(LANDSCAPE).width).toBe(PEEK_WIDTH);
    expect(wholePageSize({ width: 300, height: 900 }).height).toBe(PEEK_PAGE_MAX_HEIGHT);
    expect(wholePageSize(LETTER, 420, 300).height).toBe(300);
  });
});

describe('placePeek', () => {
  const bounds: Box = { top: 56, left: 308, bottom: 892, right: 1432 };
  const card = { width: 438, height: 330 };
  const link = (top: number, left = 500): Box => ({ top, left, bottom: top + 16, right: left + 140 });

  it('opens below the link when there is room', () => {
    expect(placePeek(link(200), card, bounds)).toEqual({ top: 224, left: 500, side: 'below' });
  });

  it('flips above when there is no room below', () => {
    const placement = placePeek(link(700), card, bounds);
    expect(placement.side).toBe('above');
    expect(placement.top).toBe(700 - 8 - card.height);
  });

  it('keeps the preferred side while it fits', () => {
    expect(placePeek(link(500), card, bounds, { prefer: 'above' }).side).toBe('above');
    expect(placePeek(link(100), card, bounds, { prefer: 'above' }).side).toBe('below');
  });

  it('uses the roomier side and stays in bounds when neither side fits', () => {
    const tall = { width: 438, height: 640 };
    const placement = placePeek(link(420), tall, bounds);
    expect(placement.side).toBe('below');
    expect(placement.top).toBe(bounds.bottom - tall.height);
    expect(placement.top).toBeGreaterThanOrEqual(bounds.top);
  });

  it('clamps horizontally inside the bounds', () => {
    expect(placePeek(link(200, 1300), card, bounds).left).toBe(bounds.right - card.width);
    expect(placePeek(link(200, 100), card, bounds).left).toBe(bounds.left);
  });

  it('pins to the top of tiny viewports', () => {
    const small: Box = { top: 56, left: 0, bottom: 300, right: 600 };
    expect(placePeek(link(120, 20), card, small).top).toBe(small.top);
  });
});
