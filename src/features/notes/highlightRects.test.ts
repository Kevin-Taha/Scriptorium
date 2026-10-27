import { describe, expect, it } from 'vitest';
import type { Highlight } from '@/lib/types';
import {
  highlightAnchorY,
  highlightAt,
  highlightRectsFor,
  mergeLineRects,
  normalizeRects,
  rectAt,
  textLineRects,
  type BoxLike,
} from './highlightRects';

const box = (left: number, top: number, width: number, height: number): BoxLike => ({
  left,
  top,
  width,
  height,
});
const sheet = box(100, 50, 600, 800);

describe('textLineRects', () => {
  it('drops tiny rectangles and container-sized ones', () => {
    const rects = [
      box(150, 300, 200, 14), // a text line
      box(150, 320, 0.5, 14), // zero-width caret
      box(150, 340, 200, 1), // hairline
      box(100, 50, 600, 800), // end-of-content sentinel covering the page
      box(150, 100, 300, 250), // element box: taller than a quarter of the page
    ];
    expect(textLineRects(rects, sheet)).toEqual([box(150, 300, 200, 14)]);
  });

  it('accepts any iterable, such as a DOMRectList', () => {
    function* generate() {
      yield box(150, 300, 200, 14);
    }
    expect(textLineRects(generate(), sheet)).toHaveLength(1);
  });
});

describe('mergeLineRects', () => {
  it('joins the spans of one line into a single bar', () => {
    const merged = mergeLineRects([box(150, 300, 100, 14), box(250, 300, 80, 14), box(335, 301, 60, 13)]);
    expect(merged).toEqual([box(150, 300, 245, 14)]);
  });

  it('keeps separate lines apart and returns them top to bottom', () => {
    const merged = mergeLineRects([box(150, 340, 300, 14), box(150, 300, 400, 14), box(150, 320, 350, 14)]);
    expect(merged.map((r) => r.top)).toEqual([300, 320, 340]);
    expect(merged.map((r) => r.width)).toEqual([400, 350, 300]);
  });

  it('does not bridge a gap wider than a word space (columns)', () => {
    const merged = mergeLineRects([box(100, 300, 120, 14), box(400, 300, 120, 14)]);
    expect(merged).toEqual([box(100, 300, 120, 14), box(400, 300, 120, 14)]);
  });

  it('absorbs a duplicate rect that sits inside another on the same line', () => {
    const merged = mergeLineRects([box(150, 300, 300, 14), box(180, 301, 100, 12)]);
    expect(merged).toEqual([box(150, 300, 300, 14)]);
  });

  it('treats rects that barely touch vertically as different lines', () => {
    const merged = mergeLineRects([box(150, 300, 200, 14), box(150, 313, 200, 14)]);
    expect(merged).toHaveLength(2);
  });

  it('returns nothing for nothing', () => {
    expect(mergeLineRects([])).toEqual([]);
  });
});

describe('normalizeRects', () => {
  it('expresses rects as fractions of the page box', () => {
    expect(normalizeRects([box(250, 250, 300, 80)], sheet)).toEqual([{ x: 0.25, y: 0.25, w: 0.5, h: 0.1 }]);
  });

  it('rounds to five decimals', () => {
    const [rect] = normalizeRects([box(100 + 600 / 3, 50, 100, 100)], sheet);
    expect(rect.x).toBe(0.33333);
  });

  it('clamps to the page and drops rects outside it', () => {
    const result = normalizeRects(
      [box(50, 40, 700, 100), box(900, 100, 50, 10), box(120, 849, 100, 40)],
      sheet,
    );
    expect(result).toEqual([
      { x: 0, y: 0, w: 1, h: 0.1125 },
      { x: 0.03333, y: 0.99875, w: 0.16667, h: 0.00125 },
    ]);
  });

  it('returns nothing for a degenerate page box', () => {
    expect(normalizeRects([box(0, 0, 10, 10)], box(0, 0, 0, 0))).toEqual([]);
  });
});

describe('highlightRectsFor', () => {
  it('turns a multi-line selection with noisy rects into one bar per line', () => {
    const rects = highlightRectsFor(
      [
        box(300, 300, 100, 14),
        box(400, 300, 150, 14),
        box(100, 50, 600, 800), // sentinel
        box(160, 320, 390, 14),
        box(160, 340, 120, 14),
        box(160, 340, 120, 14), // duplicate from the element box
      ],
      sheet,
    );
    expect(rects).toHaveLength(3);
    expect(rects[0]).toEqual({ x: 0.33333, y: 0.3125, w: 0.41667, h: 0.0175 });
    expect(rects.every((r) => r.x >= 0 && r.x + r.w <= 1 && r.y >= 0 && r.y + r.h <= 1)).toBe(true);
  });

  it('is empty when there is no usable text rect', () => {
    expect(highlightRectsFor([box(100, 50, 600, 800)], sheet)).toEqual([]);
  });
});

function highlight(id: string, rects: Highlight['rects'], createdAt = 0): Highlight {
  return { id, docId: 'd', page: 1, rects, text: id, color: 'amber', createdAt, updatedAt: createdAt };
}

describe('highlight hit testing', () => {
  const a = highlight('a', [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }]);
  const b = highlight('b', [{ x: 0.3, y: 0.2, w: 0.5, h: 0.02 }], 10);

  it('finds the rect under a point, with optional slack', () => {
    expect(rectAt(a, 0.2, 0.21)).toEqual(a.rects[0]);
    expect(rectAt(a, 0.2, 0.25)).toBeNull();
    expect(rectAt(a, 0.2, 0.2295, 0.01)).toEqual(a.rects[0]);
  });

  it('prefers the most recent highlight where they overlap', () => {
    expect(highlightAt([a, b], 0.4, 0.21)?.highlight.id).toBe('b');
    expect(highlightAt([a, b], 0.15, 0.21)?.highlight.id).toBe('a');
    expect(highlightAt([a, b], 0.9, 0.21)).toBeNull();
  });

  it('anchors a note at the middle of the first line', () => {
    expect(highlightAnchorY(a)).toBeCloseTo(0.21);
    expect(highlightAnchorY({ rects: [] })).toBe(0);
  });
});
