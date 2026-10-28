/**
 * Turns a page's searchable text (with geometry) into the sentences read aloud.
 * Pure and DOM-free: sentences are ranges of `PageText.text`, each with the
 * rectangles (page fractions) that cover it, so the highlight can be drawn.
 */
import { rangeRects, toPageFraction, type PageRect, type PageText } from '@/features/search/pageText';

export interface Sentence {
  /** What is spoken: `PageText.text` between `start` and `end`. */
  text: string;
  start: number;
  end: number;
  /** One rectangle per line the sentence touches, in reading order. */
  rects: PageRect[];
}

/** A half-open range of characters, `[start, end)`. */
export interface TextRange {
  start: number;
  end: number;
}

/** Longer sentences are cut at a clause boundary so one utterance stays short. */
const MAX_UTTERANCE_CHARS = 260;
/** Share of the page height treated as running-header / footer territory. */
const EDGE_BAND = 0.07;
/** Largest running header or footer, in characters. */
const MAX_EDGE_CHARS = 90;
/** Vertical jump (in font sizes) between two text items that starts a new block. */
const BLOCK_GAP = 1.9;
/** Numbers per run in `PageText.geometry` (see pageText.ts). */
const GEOMETRY_STRIDE = 7;

const ABBREVIATION =
  /(?:^|[\s("'“‘])(?:e\.g|i\.e|cf|vs|Fig|Figs|Eq|Eqs|Sec|Ch|Dr|Mr|Mrs|Ms|Prof|No|Vol|pp?)\.$/i;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/gu;
const PAGE_NUMBER = /^[^\p{L}\p{N}]*(?:\d{1,5}|[ivxlcdm]{1,7})?[^\p{L}\p{N}]*$/iu;
const TERMINATOR = /[.!?…]["'”’)\]]*$/;

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
    : null;

// ---------------------------------------------------------------- splitting

/** Fallback when `Intl.Segmenter` is missing: ends at . ! ? followed by whitespace (so "3.14" stays whole). */
export function splitSentencesRegex(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const match of text.matchAll(/.+?(?:[.!?…]+["'”’)\]]*(?=\s|$)|$)/gs)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function rawSentences(text: string): TextRange[] {
  if (!segmenter) return splitSentencesRegex(text);
  const ranges: TextRange[] = [];
  for (const part of segmenter.segment(text)) {
    ranges.push({ start: part.index, end: part.index + part.segment.length });
  }
  return ranges;
}

function trimRange(text: string, { start, end }: TextRange): TextRange | null {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return start < end ? { start, end } : null;
}

function wordCharCount(text: string): number {
  return text.match(LETTER_OR_DIGIT)?.length ?? 0;
}

/** Cuts a range longer than `MAX_UTTERANCE_CHARS` at clause boundaries (or spaces). */
function chunkLong(text: string, range: TextRange): TextRange[] {
  const chunks: TextRange[] = [];
  let { start } = range;
  while (range.end - start > MAX_UTTERANCE_CHARS) {
    const window = text.slice(start, start + MAX_UTTERANCE_CHARS);
    let cut = -1;
    for (const match of window.matchAll(/[;:,]\s|\s[—–-]\s/g)) {
      if (match.index >= MAX_UTTERANCE_CHARS / 2) cut = match.index + 1;
    }
    if (cut < 0) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = MAX_UTTERANCE_CHARS;
    const chunk = trimRange(text, { start, end: start + cut });
    if (chunk) chunks.push(chunk);
    start += cut;
  }
  const rest = trimRange(text, { start, end: range.end });
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Splits `text[from, to)` into sentences: trimmed, abbreviations ("Fig. 2",
 * "e.g.") and fragments with no real words joined to what follows, very long
 * ones cut at clause boundaries. Ranges are offsets into `text`.
 */
export function splitSentences(text: string, from = 0, to = text.length): TextRange[] {
  const slice = text.slice(from, to);
  const merged: TextRange[] = [];
  let carry: TextRange | null = null;
  for (const raw of rawSentences(slice)) {
    const trimmed = trimRange(slice, raw);
    if (!trimmed) continue;
    const range: TextRange = carry ? { start: carry.start, end: trimmed.end } : trimmed;
    const spoken = slice.slice(range.start, range.end);
    if (ABBREVIATION.test(spoken) || wordCharCount(spoken) < 2) {
      carry = range;
      continue;
    }
    carry = null;
    merged.push(range);
  }
  // A trailing fragment (e.g. a stray bullet) is not worth an utterance of its own.
  if (carry && wordCharCount(slice.slice(carry.start, carry.end)) >= 2) merged.push(carry);

  const result: TextRange[] = [];
  for (const range of merged) {
    const parts =
      range.end - range.start > MAX_UTTERANCE_CHARS ? chunkLong(slice, range) : ([range] as TextRange[]);
    for (const part of parts) result.push({ start: from + part.start, end: from + part.end });
  }
  return result;
}

// ------------------------------------------------------------------- blocks

/**
 * Ranges of `pageText.text` that never share a sentence: they start where the
 * page jumps vertically by more than a couple of lines (a heading, a figure
 * caption, a new column) or enters/leaves the running-header and footer bands.
 * Without this, an unpunctuated header would be glued to the first sentence.
 */
export function textBlocks(pageText: PageText): TextRange[] {
  const { runs, geometry, text, box } = pageText;
  const count = runs.length / 2;
  if (count === 0) return [];
  const blocks: TextRange[] = [];
  let start = runs[0];
  let zone = zoneOf(box, geometry, 0);
  for (let run = 1; run < count; run++) {
    const g = run * GEOMETRY_STRIDE;
    const p = g - GEOMETRY_STRIDE;
    const nextZone = zoneOf(box, geometry, run);
    if (nextZone !== zone || verticalJump(geometry, p, g) > BLOCK_GAP) {
      blocks.push({ start, end: runs[2 * (run - 1)] + runs[2 * (run - 1) + 1] });
      start = runs[2 * run];
    }
    zone = nextZone;
  }
  blocks.push({ start, end: Math.min(text.length, runs[2 * (count - 1)] + runs[2 * (count - 1) + 1]) });
  return blocks;
}

type Zone = 'top' | 'body' | 'bottom';

function zoneOf(box: PageText['box'], geometry: Float32Array, run: number): Zone {
  // Origin of the run in page fractions; only the vertical part matters.
  const g = run * GEOMETRY_STRIDE;
  const [, y] = toPageFraction(box, geometry[g], geometry[g + 1]);
  if (y < EDGE_BAND) return 'top';
  return y > 1 - EDGE_BAND ? 'bottom' : 'body';
}

/** Distance across the baseline direction between two runs, in units of the smaller font size. */
function verticalJump(geometry: Float32Array, from: number, to: number): number {
  const size = Math.min(
    Math.hypot(geometry[from + 4], geometry[from + 5]) || Infinity,
    Math.hypot(geometry[to + 4], geometry[to + 5]) || Infinity,
  );
  if (!Number.isFinite(size)) return 0;
  const length = Math.hypot(geometry[from + 2], geometry[from + 3]) || 1;
  const ux = geometry[from + 2] / length;
  const uy = geometry[from + 3] / length;
  const dx = geometry[to] - geometry[from];
  const dy = geometry[to + 1] - geometry[from + 1];
  return Math.abs(dy * ux - dx * uy) / size;
}

// ---------------------------------------------------------------- the page

function isRunningHeaderOrFooter(sentence: Sentence): boolean {
  if (sentence.rects.length === 0 || sentence.text.length > MAX_EDGE_CHARS) return false;
  const inBand = sentence.rects.every(
    (r) => r.y + r.height <= EDGE_BAND + 0.01 || r.y >= 1 - EDGE_BAND - 0.01,
  );
  if (!inBand) return false;
  return PAGE_NUMBER.test(sentence.text) || !TERMINATOR.test(sentence.text);
}

/** The sentences of a page in reading order, without running headers, footers and page numbers. */
export function buildPageSentences(pageText: PageText): Sentence[] {
  const sentences: Sentence[] = [];
  for (const block of textBlocks(pageText)) {
    for (const { start, end } of splitSentences(pageText.text, block.start, block.end)) {
      const rects = rangeRects(pageText, start, end);
      if (rects.length === 0) continue;
      const sentence: Sentence = { text: pageText.text.slice(start, end), start, end, rects };
      if (!isRunningHeaderOrFooter(sentence)) sentences.push(sentence);
    }
  }
  return sentences;
}

// ----------------------------------------------------------------- locating

/** Index of the first sentence that starts at or below `offset` (a page fraction); `sentences.length` if none. */
export function firstSentenceAtOrAfter(sentences: readonly Sentence[], offset: number): number {
  const index = sentences.findIndex((s) => s.rects[0].y >= offset - 0.0005);
  return index < 0 ? sentences.length : index;
}

/**
 * Index of the sentence a point (page fractions) falls in, or else the next
 * sentence after it; `sentences.length` when the point is past the last one.
 */
export function sentenceAtOrAfterPoint(sentences: readonly Sentence[], x: number, y: number): number {
  const index = sentences.findIndex((s) => {
    const last = s.rects[s.rects.length - 1];
    const middle = last.y + last.height / 2;
    if (Math.abs(middle - y) <= last.height * 0.6) return last.x + last.width > x;
    return middle > y;
  });
  return index < 0 ? sentences.length : index;
}

// -------------------------------------------------------------- word timing

const WORDS_PER_MINUTE = 180;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** How long a sentence takes at `rate` when no voice is available (≈ 180 words per minute at 1×). */
export function estimateDurationMs(text: string, rate: number): number {
  return Math.max(700, (wordCount(text) / (WORDS_PER_MINUTE * rate)) * 60_000);
}

/** The word at `charIndex` of `text` as a range; `charLength` (from speech boundary events) is optional. */
export function wordRangeAt(text: string, charIndex: number, charLength?: number): TextRange | null {
  let start = Math.max(0, Math.min(charIndex, text.length));
  while (start < text.length && /\s/.test(text[start])) start++;
  if (start >= text.length) return null;
  let end = start + (charLength && charLength > 0 ? charLength : 0);
  if (end <= start) {
    end = start;
    while (end < text.length && !/\s/.test(text[end])) end++;
  }
  end = Math.min(end, text.length);
  while (end > start && /[\s,;:.!?)"”’]/.test(text[end - 1]) && end - start > 1) end--;
  return { start, end };
}
