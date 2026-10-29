import { describe, expect, it } from 'vitest';
import {
  buildPageText,
  charWeight,
  cleanText,
  foldText,
  rangeRects,
  toPageFraction,
  type PageBox,
  type PageText,
  type TextItemLike,
} from './pageText';

const PAGE: PageBox = { view: [0, 0, 600, 800], rotation: 0 };

/** A text item set in `size`-point type; its width defaults to half an em per character. */
function item(str: string, x: number, y: number, extra: Partial<TextItemLike> & { size?: number } = {}) {
  const { size = 10, ...rest } = extra;
  return {
    str,
    transform: [size, 0, 0, size, x, y],
    width: str.length * size * 0.5,
    height: size,
    hasEOL: false,
    ...rest,
  } satisfies TextItemLike;
}

const textOf = (items: TextItemLike[]) => buildPageText(1, items, PAGE).text;

describe('foldText', () => {
  it('removes case and diacritics without changing length', () => {
    expect(foldText('Schrödinger')).toBe('schrodinger');
    expect(foldText('ÉCOLE Ångström')).toBe('ecole angstrom');
    expect(foldText('naïve façade')).toHaveLength('naïve façade'.length);
  });

  it('treats typographic quotes and dashes like their plain forms', () => {
    expect(foldText('don’t “quote” a–b')).toBe('don\'t "quote" a-b');
  });

  it('leaves characters it cannot fold one-to-one untouched', () => {
    expect(foldText('straße København')).toBe('straße københavn');
    expect(foldText('한국어')).toBe('한국어');
  });
});

describe('cleanText', () => {
  it('collapses and trims whitespace, expands ligatures and drops invisible characters', () => {
    expect(cleanText('  two \t words\u00a0here \n')).toBe('two words here');
    expect(cleanText('ﬁnd the ﬂow of e\u00adnergy')).toBe('find the flow of energy');
  });
});

describe('charWeight', () => {
  it('gives narrow glyphs less room than wide ones', () => {
    expect(charWeight('i')).toBeLessThan(charWeight('n'));
    expect(charWeight('n')).toBeLessThan(charWeight('m'));
    expect(charWeight('m')).toBeLessThan(charWeight('W'));
    expect(charWeight('漢')).toBe(1);
  });
});

describe('buildPageText', () => {
  it('separates lines with a single space', () => {
    expect(textOf([item('first line', 72, 700), item('second line', 72, 686)])).toBe(
      'first line second line',
    );
  });

  it('honours end-of-line markers and skips empty items', () => {
    expect(textOf([item('a', 72, 700, { hasEOL: true }), item('', 72, 700), item('b', 400, 700)])).toBe(
      'a b',
    );
  });

  it('joins items that touch on a line, such as a superscript, but spaces real gaps', () => {
    const items = [item('k', 72, 700), item('2', 77, 703, { size: 6.5 }), item('nodes', 95, 700)];
    expect(textOf(items)).toBe('k2 nodes');
  });

  it('collapses whitespace, including whitespace-only items', () => {
    expect(textOf([item('a  b', 72, 700), item(' ', 90, 700), item(' c', 92, 700)])).toBe('a b c');
  });

  it('joins words hyphenated across lines', () => {
    const items = [item('an electro-', 72, 700, { hasEOL: true }), item('magnetic wave', 72, 686)];
    expect(textOf(items)).toBe('an electromagnetic wave');
  });

  it('keeps the hyphen when the next line starts like a new word', () => {
    expect(textOf([item('Anglo-', 72, 700, { hasEOL: true }), item('Saxon', 72, 686)])).toBe('Anglo- Saxon');
    expect(textOf([item('a -', 72, 700, { hasEOL: true }), item('b', 72, 686)])).toBe('a - b');
    expect(textOf([item('1990-', 72, 700, { hasEOL: true }), item('ish', 72, 686)])).toBe('1990- ish');
  });

  it('joins words split with a soft hyphen at the end of a line', () => {
    const items = [item('electro\u00ad', 72, 700, { hasEOL: true }), item('magnetic', 72, 686)];
    expect(textOf(items)).toBe('electromagnetic');
  });

  it('expands ligatures and keeps the folded text aligned with the readable text', () => {
    const page = buildPageText(1, [item('Schröding\u00e9r \ufb01nds', 72, 700)], PAGE);
    expect(page.text).toBe('Schrödingér finds');
    expect(page.folded).toBe('schrodinger finds');
    expect(page.folded).toHaveLength(page.text.length);
  });

  it('has no text for a page without items', () => {
    expect(buildPageText(3, [], PAGE)).toMatchObject({ page: 3, text: '', folded: '' });
  });
});

describe('toPageFraction', () => {
  const box = (rotation: number): PageBox => ({ view: [100, 50, 300, 450], rotation });

  it('maps PDF points to the displayed page for every rotation', () => {
    // Bottom-left of the page is (100, 50); top-right is (300, 450).
    expect(toPageFraction(box(0), 100, 50)).toEqual([0, 1]);
    expect(toPageFraction(box(0), 300, 450)).toEqual([1, 0]);
    expect(toPageFraction(box(90), 100, 50)).toEqual([0, 0]);
    expect(toPageFraction(box(90), 300, 450)).toEqual([1, 1]);
    expect(toPageFraction(box(180), 100, 50)).toEqual([1, 0]);
    expect(toPageFraction(box(180), 300, 450)).toEqual([0, 1]);
    expect(toPageFraction(box(270), 100, 50)).toEqual([1, 1]);
    expect(toPageFraction(box(270), 300, 450)).toEqual([0, 0]);
  });

  it('accounts for a view box that does not start at the origin', () => {
    expect(toPageFraction(box(0), 200, 250)).toEqual([0.5, 0.5]);
  });
});

describe('rangeRects', () => {
  const page = (items: TextItemLike[], box = PAGE): PageText => buildPageText(1, items, box);

  it('places a range inside an item proportionally to the characters before it', () => {
    // "nnnnnnnnnn": equal glyphs, 100pt wide, starting at x = 100.
    const [rect, ...more] = rangeRects(page([item('nnnnnnnnnn', 100, 700, { width: 100 })]), 2, 5);
    expect(more).toHaveLength(0);
    expect(rect.x).toBeCloseTo((100 + 20) / 600, 5);
    expect(rect.width).toBeCloseTo(30 / 600, 5);
    // The box straddles the baseline (y = 700 → fraction 0.125 from the top).
    expect(rect.y).toBeLessThan(0.125);
    expect(rect.y + rect.height).toBeGreaterThan(0.125);
  });

  it('shares an item’s width by glyph width, not character count', () => {
    const text = page([item('iiiiWWWW', 100, 700, { width: 100 })]);
    const [rect] = rangeRects(text, 4, 8);
    expect(rect.x).toBeGreaterThan(100 / 600);
    expect(rect.x).toBeLessThan((100 + 50) / 600);
    expect(rect.x + rect.width).toBeCloseTo(200 / 600, 5);
  });

  it('covers a match that is split across a hyphenated line break with one rectangle per line', () => {
    const items = [item('an electro-', 100, 700, { hasEOL: true }), item('magnetic wave', 100, 686)];
    const text = page(items);
    const start = text.text.indexOf('electromagnetic');
    const rects = rangeRects(text, start, start + 'electromagnetic'.length);
    expect(rects).toHaveLength(2);
    expect(rects[1].y).toBeGreaterThan(rects[0].y);
    expect(rects[0].x).toBeGreaterThan(rects[1].x);
  });

  it('merges neighbouring items on one line', () => {
    const text = page([item('foo', 100, 700), item('bar', 118, 700)]);
    expect(text.text).toBe('foo bar');
    expect(rangeRects(text, 0, 7)).toHaveLength(1);
  });

  it('follows page rotation', () => {
    const rotated = page([item('nnnnnnnnnn', 100, 700, { width: 100 })], {
      view: [0, 0, 600, 800],
      rotation: 90,
    });
    const [rect] = rangeRects(rotated, 0, 10);
    // Text running left→right across a page turned a quarter turn runs top→bottom.
    expect(rect.height).toBeCloseTo(100 / 800, 1);
    expect(rect.width).toBeLessThan(0.05);
  });

  it('returns nothing for a range outside any text item', () => {
    expect(rangeRects(page([item('abc', 100, 700)]), 10, 12)).toEqual([]);
  });
});
