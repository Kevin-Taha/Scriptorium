import type { Highlight, HighlightRect } from '@/lib/types';

/** A rectangle in any consistent unit (CSS px in the viewport, or fractions of a page). */
export interface BoxLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Rects taller than this share of the page are containers (e.g. pdf.js's end-of-content), not text. */
const MAX_LINE_HEIGHT_SHARE = 0.25;
/** Two rects belong to one line when they overlap vertically by at least this share of the shorter one. */
const SAME_LINE_OVERLAP = 0.5;
/** Neighbours on a line are joined when the gap is at most this many line-heights (a word space). */
const WORD_GAP_LINE_HEIGHTS = 0.75;
const PRECISION = 1e5;

const bottom = (box: BoxLike) => box.top + box.height;
const right = (box: BoxLike) => box.left + box.width;

/**
 * The rectangles of a selection's text lines: tiny rects and container-sized
 * ones (the pdf.js end-of-content sentinel, element boxes) are dropped.
 */
export function textLineRects<T extends BoxLike>(rects: Iterable<T>, sheet: BoxLike): T[] {
  return Array.from(rects).filter(
    (rect) => rect.width > 1 && rect.height > 1 && rect.height < sheet.height * MAX_LINE_HEIGHT_SHARE,
  );
}

/**
 * Merges text-node rectangles into one rectangle per run of text on a line, so
 * a highlight is a handful of clean bars rather than a rect per pdf.js span.
 * Runs separated by more than a word space (e.g. two columns) stay separate.
 */
export function mergeLineRects(rects: BoxLike[]): BoxLike[] {
  const lines: { top: number; bottom: number; members: BoxLike[] }[] = [];
  for (const rect of [...rects].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find((candidate) => {
      const overlap = Math.min(candidate.bottom, bottom(rect)) - Math.max(candidate.top, rect.top);
      return overlap >= SAME_LINE_OVERLAP * Math.min(candidate.bottom - candidate.top, rect.height);
    });
    if (line) {
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, bottom(rect));
      line.members.push(rect);
    } else {
      lines.push({ top: rect.top, bottom: bottom(rect), members: [rect] });
    }
  }

  const runs: BoxLike[] = [];
  for (const line of lines) {
    const members = line.members.sort((a, b) => a.left - b.left);
    const maxGap = (line.bottom - line.top) * WORD_GAP_LINE_HEIGHTS;
    let current: { left: number; top: number; right: number; bottom: number } | null = null;
    const flush = () => {
      if (current) {
        runs.push({
          left: current.left,
          top: current.top,
          width: current.right - current.left,
          height: current.bottom - current.top,
        });
      }
    };
    for (const member of members) {
      if (current && member.left <= current.right + maxGap) {
        current.right = Math.max(current.right, right(member));
        current.top = Math.min(current.top, member.top);
        current.bottom = Math.max(current.bottom, bottom(member));
      } else {
        flush();
        current = { left: member.left, top: member.top, right: right(member), bottom: bottom(member) };
      }
    }
    flush();
  }
  return runs.sort((a, b) => a.top - b.top || a.left - b.left);
}

const round = (value: number) => Math.round(value * PRECISION) / PRECISION;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Expresses viewport rects as fractions of the page box, clamped to the page. */
export function normalizeRects(rects: BoxLike[], sheet: BoxLike): HighlightRect[] {
  if (sheet.width <= 0 || sheet.height <= 0) return [];
  const result: HighlightRect[] = [];
  for (const rect of rects) {
    const x0 = clamp01((rect.left - sheet.left) / sheet.width);
    const y0 = clamp01((rect.top - sheet.top) / sheet.height);
    const x1 = clamp01((right(rect) - sheet.left) / sheet.width);
    const y1 = clamp01((bottom(rect) - sheet.top) / sheet.height);
    if (x1 > x0 && y1 > y0) result.push({ x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) });
  }
  return result;
}

/** The highlight rectangles for a selection's client rects on the page box `sheet`. */
export function highlightRectsFor(clientRects: Iterable<BoxLike>, sheet: BoxLike): HighlightRect[] {
  return normalizeRects(mergeLineRects(textLineRects(clientRects, sheet)), sheet);
}

/** Vertical anchor for a note about the highlight: the middle of its first line. */
export function highlightAnchorY(highlight: Pick<Highlight, 'rects'>): number {
  const first = highlight.rects[0];
  return first ? first.y + first.h / 2 : 0;
}

/** The highlight rectangle (if any) containing the page-fraction point, with a little slack. */
export function rectAt(
  highlight: Pick<Highlight, 'rects'>,
  x: number,
  y: number,
  slack = 0,
): HighlightRect | null {
  return (
    highlight.rects.find(
      (r) => x >= r.x - slack && x <= r.x + r.w + slack && y >= r.y - slack && y <= r.y + r.h + slack,
    ) ?? null
  );
}

/** The topmost (most recently made) highlight under the page-fraction point. */
export function highlightAt(
  highlights: readonly Highlight[],
  x: number,
  y: number,
  slack = 0,
): { highlight: Highlight; rect: HighlightRect } | null {
  let best: { highlight: Highlight; rect: HighlightRect } | null = null;
  for (const highlight of highlights) {
    const rect = rectAt(highlight, x, y, slack);
    if (rect && (!best || highlight.createdAt >= best.highlight.createdAt)) best = { highlight, rect };
  }
  return best;
}
