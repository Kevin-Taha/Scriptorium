/**
 * Turns the text items pdf.js extracts from a page into a searchable string
 * and a map from string offsets back to page geometry, so a match can be drawn
 * as highlight rectangles. Everything here is pure and DOM-free.
 */

/** The fields of a pdf.js `TextItem` that search relies on. */
export interface TextItemLike {
  str: string;
  /** `[a, b, c, d, e, f]`: baseline direction (a, b), "up" vector (c, d), origin (e, f), in PDF space. */
  transform: readonly number[];
  /** Advance width along the baseline, in PDF units. */
  width: number;
  height: number;
  hasEOL?: boolean;
}

export interface PageBox {
  /** The page's visible box in PDF space: `[x0, y0, x1, y1]` (pdf.js `page.view`). */
  view: readonly [number, number, number, number];
  /** Intrinsic page rotation in degrees (pdf.js `page.rotate`). */
  rotation: number;
}

export interface PageText {
  page: number;
  /** Readable page text: whitespace collapsed, ligatures expanded, line-end hyphens joined. */
  text: string;
  /** `text` with case, diacritics and typographic quotes/dashes folded away. Same length, so offsets are shared. */
  folded: string;
  /** `(start, length)` pairs: the ranges of `text` that came from a text item. */
  runs: Int32Array;
  /** Seven numbers per run, see {@link GEOMETRY_STRIDE}. */
  geometry: Float32Array;
  box: PageBox;
}

/** A rectangle as fractions (0–1) of the displayed page, measured from its top-left corner. */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Per run: item origin `x, y`; baseline displacement per weight unit `ux, uy`;
 * the item's "up" vector `vx, vy`; and the weight of the item's text before the run.
 */
const GEOMETRY_STRIDE = 7;

export const DEFAULT_BOX: PageBox = { view: [0, 0, 612, 792], rotation: 0 };

// ------------------------------------------------------------------ folding

const MARKS = /[\u0300-\u036f]/g;
const ASCII = /^[\t\n\r\x20-\x7e]*$/;
const WORD_CHAR = /[\p{L}\p{N}_]/u;
const SINGLE_QUOTES = new Set(['\u2018', '\u2019', '\u201a', '\u201b', '\u2032', '\u02bc']);
const DOUBLE_QUOTES = new Set(['\u201c', '\u201d', '\u201e', '\u201f', '\u2033']);

const foldedUnits = new Map<string, string>();
const caseKeptUnits = new Map<string, string>();

/** Folds one UTF-16 unit to exactly one unit; anything that cannot be folded 1:1 is left alone. */
function foldUnit(unit: string, lower: boolean): string {
  const cache = lower ? foldedUnits : caseKeptUnits;
  let folded = cache.get(unit);
  if (folded === undefined) {
    const code = unit.charCodeAt(0);
    if ((code >= 0x2010 && code <= 0x2013) || code === 0x2212) folded = '-';
    else if (SINGLE_QUOTES.has(unit)) folded = "'";
    else if (DOUBLE_QUOTES.has(unit)) folded = '"';
    else {
      const base = unit.normalize('NFD').replace(MARKS, '');
      folded = base.length === 1 ? base : unit;
    }
    if (lower) {
      const lowered = folded.toLowerCase();
      if (lowered.length === 1) folded = lowered;
    }
    cache.set(unit, folded);
  }
  return folded;
}

/**
 * Removes diacritics and typographic quote/dash variants, and (unless
 * `lower` is false) case. The result always has the length of the input.
 */
export function foldText(text: string, lower = true): string {
  if (ASCII.test(text)) return lower ? text.toLowerCase() : text;
  let folded = '';
  for (let i = 0; i < text.length; i++) {
    const unit = text[i];
    folded += unit.charCodeAt(0) < 128 ? (lower ? unit.toLowerCase() : unit) : foldUnit(unit, lower);
  }
  return folded;
}

export function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

// ------------------------------------------------------------ char cleaning

const LIGATURES: Record<string, string> = {
  '\ufb00': 'ff',
  '\ufb01': 'fi',
  '\ufb02': 'fl',
  '\ufb03': 'ffi',
  '\ufb04': 'ffl',
  '\ufb05': 'st',
  '\ufb06': 'st',
};
const SOFT_HYPHEN = 0xad;
/** Soft hyphen and zero-width characters: invisible, so they are dropped. */
const IGNORABLE = new Set([SOFT_HYPHEN, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const expansions = new Map<string, string>();

/** What a source character contributes to the text: `''` (dropped), `' '` (any whitespace) or its text. */
function expandChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code < 128) return code === 32 || (code >= 9 && code <= 13) ? ' ' : char;
  let piece = expansions.get(char);
  if (piece === undefined) {
    if (IGNORABLE.has(code)) piece = '';
    else piece = LIGATURES[char] ?? (/\s/.test(char) ? ' ' : char);
    expansions.set(char, piece);
  }
  return piece;
}

/** Cleans free text (a search query) the same way page text is cleaned: no folding, single spaces, trimmed. */
export function cleanText(raw: string): string {
  let text = '';
  let spaced = true;
  for (const char of raw) {
    const piece = expandChar(char);
    if (piece === '') continue;
    if (piece === ' ') {
      if (!spaced) text += ' ';
      spaced = true;
    } else {
      text += piece;
      spaced = false;
    }
  }
  return spaced && text ? text.slice(0, -1) : text;
}

// ------------------------------------------------------------------ weights

const WEIGHTS = new Map<string, number>();
for (const [chars, weight] of [
  [" ijl.,:;'`!|", 0.27],
  ['ftrI()[]{}/\\-"', 0.33],
  ['scz', 0.45],
  ['w', 0.72],
  ['m', 0.8],
  ['M', 0.87],
  ['W', 0.95],
  ['%&', 0.78],
  ['@', 0.9],
] as const) {
  for (const char of chars) WEIGHTS.set(char, weight);
}

/**
 * Approximate advance of a character in em, from a typical text face. The font
 * itself is unknown, so this only decides how an item's width is shared out
 * between its characters; it is far closer than an even split.
 */
export function charWeight(char: string): number {
  const known = WEIGHTS.get(char);
  if (known !== undefined) return known;
  const code = char.charCodeAt(0);
  if (code >= 0x2e80) return 1;
  if (code >= 0x41 && code <= 0x5a) return 0.68;
  if (code >= 0x30 && code <= 0x39) return 0.53;
  if (code >= 0x61 && code <= 0x7a) return 0.5;
  return 0.52;
}

function textWeight(text: string, from: number, to: number): number {
  let weight = 0;
  for (let i = from; i < to; i++) weight += charWeight(text[i]);
  return weight;
}

// ------------------------------------------------------------------ building

/** How the next item continues the previous one. */
type Relation = 'adjacent' | 'gap' | 'line';

/** Share of the font size within which two items on a line still belong to the same word. */
const WORD_GAP = 0.12;
/** Items further apart than this share of the font size across the baseline are on different lines. */
const LINE_OFFSET = 0.5;

function fontSize(item: TextItemLike): number {
  return Math.hypot(item.transform[2], item.transform[3]) || item.height || 1;
}

function relationBetween(previous: TextItemLike, item: TextItemLike): Relation {
  if (previous.hasEOL) return 'line';
  const [a, b, , , x, y] = previous.transform;
  const size = Math.max(fontSize(previous), fontSize(item));
  const length = Math.hypot(a, b) || 1;
  const ux = a / length;
  const uy = b / length;
  const dx = item.transform[4] - x;
  const dy = item.transform[5] - y;
  if (Math.abs(dy * ux - dx * uy) > size * LINE_OFFSET) return 'line';
  const gap = dx * ux + dy * uy - previous.width;
  return gap < size * WORD_GAP && gap > -size ? 'adjacent' : 'gap';
}

class PageTextBuilder {
  private text = '';
  /** The last two characters of `text`, so the (possibly huge) string never has to be read back. */
  private tail = '';
  private readonly runs: number[] = [];
  private readonly geometry: number[] = [];
  private previous: TextItemLike | null = null;
  private endedWithSoftHyphen = false;

  add(item: TextItemLike): void {
    const { str, transform } = item;
    const pending: { start: number; length: number; weightBefore: number }[] = [];
    let open: (typeof pending)[number] | null = null;
    let chunk = '';
    let last = '';
    let weight = 0;
    let softHyphen = false;
    let joined = false;

    for (let i = 0; i < str.length; i++) {
      const piece = expandChar(str[i]);
      if (piece === '') {
        softHyphen = softHyphen || str.charCodeAt(i) === SOFT_HYPHEN;
        open = null;
        continue;
      }
      if (!joined) {
        joined = true;
        if (this.previous) this.join(this.previous, item, str);
        last = this.tail.at(-1) ?? '';
      }
      if (piece === ' ' && (last === '' || last === ' ')) {
        weight += charWeight(' ');
        open = null;
        continue;
      }
      if (!open) {
        open = { start: chunk.length, length: 0, weightBefore: weight };
        pending.push(open);
      }
      chunk += piece;
      last = piece.at(-1)!;
      open.length += piece.length;
      for (const char of piece) weight += charWeight(char);
      softHyphen = false;
    }
    if (pending.length === 0) return;

    const base = this.text.length;
    const direction = Math.hypot(transform[0], transform[1]) || 1;
    const advance = (item.width > 0 ? item.width : weight * fontSize(item)) / weight;
    const ux = (transform[0] / direction) * advance;
    const uy = (transform[1] / direction) * advance;
    for (const run of pending) {
      this.runs.push(base + run.start, run.length);
      this.geometry.push(transform[4], transform[5], ux, uy, transform[2], transform[3], run.weightBefore);
    }
    this.text += chunk;
    this.tail = (this.tail + chunk).slice(-2);
    this.previous = item;
    this.endedWithSoftHyphen = softHyphen;
  }

  finish(page: number, box: PageBox): PageText {
    return {
      page,
      text: this.text,
      folded: foldText(this.text),
      runs: Int32Array.from(this.runs),
      geometry: Float32Array.from(this.geometry),
      box,
    };
  }

  /** Separates (or deliberately joins) the previous item and the one about to be appended. */
  private join(previous: TextItemLike, item: TextItemLike, upcoming: string): void {
    const relation = relationBetween(previous, item);
    if (relation === 'adjacent') return;
    if (relation === 'line') {
      if (this.endedWithSoftHyphen) return;
      if (this.endsWithHyphenatedWord() && /^\p{Ll}/u.test(upcoming)) {
        this.dropLastChar();
        return;
      }
    }
    if (this.tail !== '' && !this.tail.endsWith(' ')) {
      this.text += ' ';
      this.tail = `${this.tail} `.slice(-2);
    }
  }

  /** True for "…electro-": a letter followed by a hyphen at the very end of the text. */
  private endsWithHyphenatedWord(): boolean {
    const [letter, hyphen] = [this.tail.at(-2), this.tail.at(-1)];
    return (hyphen === '-' || hyphen === '\u2010' || hyphen === '\u2011') && isLetter(letter);
  }

  private dropLastChar(): void {
    this.text = this.text.slice(0, -1);
    this.tail = this.text.slice(-2);
    const lengthAt = this.runs.length - 1;
    if (this.runs[lengthAt] > 1) this.runs[lengthAt] -= 1;
    else {
      this.runs.length -= 2;
      this.geometry.length -= GEOMETRY_STRIDE;
    }
  }
}

function isLetter(char: string | undefined): boolean {
  return char !== undefined && /\p{L}/u.test(char);
}

/** Builds the searchable form of a page from its text items (in content-stream order). */
export function buildPageText(
  page: number,
  items: readonly TextItemLike[],
  box: PageBox = DEFAULT_BOX,
): PageText {
  const builder = new PageTextBuilder();
  for (const item of items) builder.add(item);
  return builder.finish(page, box);
}

// --------------------------------------------------------------- rectangles

/** Glyph box around the baseline, in ems: roughly ascender-to-descender, like a text selection. */
const ASCENT = 0.86;
const DESCENT = 0.22;

/** Maps a PDF-space point to fractions of the displayed (rotated) page. */
export function toPageFraction(box: PageBox, x: number, y: number): [number, number] {
  const [x0, y0, x1, y1] = box.view;
  const nx = (x - x0) / (x1 - x0 || 1);
  const ny = (y - y0) / (y1 - y0 || 1);
  switch (((Math.round(box.rotation / 90) % 4) + 4) % 4) {
    case 1:
      return [ny, nx];
    case 2:
      return [1 - nx, ny];
    case 3:
      return [1 - ny, 1 - nx];
    default:
      return [nx, 1 - ny];
  }
}

/** Width ÷ height of the page as displayed. */
function displayAspect(box: PageBox): number {
  const [x0, y0, x1, y1] = box.view;
  const aspect = (x1 - x0) / (y1 - y0 || 1);
  return Math.round(box.rotation / 90) % 2 === 0 ? aspect : 1 / aspect;
}

/**
 * Rectangles covering `text[start, end)`: one per text item the range touches,
 * with neighbours on the same line merged. Characters inside an item are
 * placed by weighted width, so highlights track the words closely.
 */
export function rangeRects(pageText: PageText, start: number, end: number): PageRect[] {
  const { runs, geometry, text, box } = pageText;
  const count = runs.length / 2;
  let low = 0;
  let high = count;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (runs[2 * mid] + runs[2 * mid + 1] <= start) low = mid + 1;
    else high = mid;
  }

  const rects: PageRect[] = [];
  for (let run = low; run < count; run++) {
    const runStart = runs[2 * run];
    if (runStart >= end) break;
    const from = Math.max(start, runStart);
    const to = Math.min(end, runStart + runs[2 * run + 1]);
    if (from >= to) continue;

    const g = run * GEOMETRY_STRIDE;
    const before = geometry[g + 6] + textWeight(text, runStart, from);
    const after = before + textWeight(text, from, to);
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const [along, up] of [
      [before, -DESCENT],
      [after, -DESCENT],
      [after, ASCENT],
      [before, ASCENT],
    ]) {
      const [x, y] = toPageFraction(
        box,
        geometry[g] + geometry[g + 2] * along + geometry[g + 4] * up,
        geometry[g + 1] + geometry[g + 3] * along + geometry[g + 5] * up,
      );
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    rects.push({ x: left, y: top, width: right - left, height: bottom - top });
  }
  return mergeLineRects(rects, displayAspect(box));
}

/** Joins rectangles that sit on the same line and almost touch. */
function mergeLineRects(rects: PageRect[], aspect: number): PageRect[] {
  const merged: PageRect[] = [];
  for (const rect of rects) {
    const last = merged.at(-1);
    if (last) {
      const overlap = Math.min(last.y + last.height, rect.y + rect.height) - Math.max(last.y, rect.y);
      const gap = (Math.max(last.x, rect.x) - Math.min(last.x + last.width, rect.x + rect.width)) / aspect;
      if (
        overlap > 0.5 * Math.min(last.height, rect.height) &&
        gap < 0.6 * Math.max(last.height, rect.height)
      ) {
        const x = Math.min(last.x, rect.x);
        const y = Math.min(last.y, rect.y);
        last.width = Math.max(last.x + last.width, rect.x + rect.width) - x;
        last.height = Math.max(last.y + last.height, rect.y + rect.height) - y;
        last.x = x;
        last.y = y;
        continue;
      }
    }
    merged.push({ ...rect });
  }
  return merged;
}
