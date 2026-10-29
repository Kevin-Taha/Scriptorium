/**
 * Note text stays a plain string in which `**bold**` and `*italic*` mark emphasis, as in
 * Markdown. Only clear emphasis parses: delimiters follow CommonMark's flanking rules and,
 * as CommonMark has it for `_`, never open or close inside a word. So everyday asterisks
 * ("2 * 3", "5* rating", "2*3*4", "p = m*v*t", "x**2") stay literal, and notes written before
 * formatting existed keep their meaning — but emphasis covers whole words only. A literal
 * asterisk is stored as typed, or as `\*` where it could be read as a marker. Backslashes
 * only matter right before an asterisk, where a run of them halves, so text like `C:\docs`
 * is never touched. Emphasis does not span lines. Markdown itself allows emphasis inside a
 * word, so the export escapes asterisks there (`markdownNoteText`).
 */

export interface NoteRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

interface Delimiter {
  /** Index of this run in the line's tokens. */
  token: number;
  /** Asterisks not yet matched. */
  count: number;
  /** Asterisks in the run as written. */
  length: number;
  canOpen: boolean;
  canClose: boolean;
  prev: Delimiter | null;
  next: Delimiter | null;
}

type CharClass = 'space' | 'punct' | 'other';

const SPACE = /\s/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;

function classify(char: string): CharClass {
  if (char === '' || SPACE.test(char)) return 'space';
  return PUNCTUATION.test(char) ? 'punct' : 'other';
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** The character (code point) ending at `index`, or '' at the start of the line. */
function charBefore(line: string, index: number): string {
  if (index === 0) return '';
  return index >= 2 && isLowSurrogate(line.charCodeAt(index - 1))
    ? line.slice(index - 2, index)
    : line[index - 1];
}

function charAt(line: string, index: number): string {
  const code = line.codePointAt(index);
  return code === undefined ? '' : String.fromCodePoint(code);
}

/** True when `line[start, end)` sits between two word characters, as the asterisks in "2*3". */
function inWord(line: string, start: number, end: number): boolean {
  return classify(charBefore(line, start)) === 'other' && classify(charAt(line, end)) === 'other';
}

function appendRun(runs: NoteRun[], text: string, bold: boolean, italic: boolean): void {
  if (text === '') return;
  const last = runs.at(-1);
  if (last && last.bold === bold && last.italic === italic) last.text += text;
  else runs.push({ text, bold, italic });
}

function unlink(delimiter: Delimiter): void {
  if (delimiter.prev) delimiter.prev.next = delimiter.next;
  if (delimiter.next) delimiter.next.prev = delimiter.prev;
}

/** CommonMark's "rule of 3" for runs that could both open and close (only between punctuation). */
function canMatch(opener: Delimiter, closer: Delimiter): boolean {
  if (!opener.canOpen) return false;
  if (!opener.canClose && !closer.canOpen) return true;
  const sum = opener.length + closer.length;
  return sum % 3 !== 0 || (opener.length % 3 === 0 && closer.length % 3 === 0);
}

function parseLine(line: string, runs: NoteRun[]): void {
  const tokens: (string | Delimiter)[] = [];
  let first: Delimiter | null = null;
  let last: Delimiter | null = null;
  let text = '';
  let i = 0;
  while (i < line.length) {
    const char = line[i];
    if (char === '\\') {
      let end = i;
      while (line[end] === '\\') end++;
      if (line[end] !== '*') {
        text += line.slice(i, end);
      } else {
        const slashes = end - i;
        text += '\\'.repeat(slashes >> 1);
        // An odd run escapes the asterisk; an even one leaves it to start a delimiter run.
        if (slashes % 2 === 1) {
          text += '*';
          end++;
        }
      }
      i = end;
    } else if (char === '*') {
      let end = i;
      while (line[end] === '*') end++;
      if (inWord(line, i, end)) {
        // "2*3*4", "x**2": inside a word, asterisks are text.
        text += line.slice(i, end);
      } else {
        const before = classify(charBefore(line, i));
        const after = classify(charAt(line, end));
        if (text) tokens.push(text);
        text = '';
        // Left- and right-flanking. Outside words, a run is both only between punctuation.
        const delimiter: Delimiter = {
          token: tokens.length,
          count: end - i,
          length: end - i,
          canOpen: after !== 'space' && (after !== 'punct' || before !== 'other'),
          canClose: before !== 'space' && (before !== 'punct' || after !== 'other'),
          prev: last,
          next: null,
        };
        if (last) last.next = delimiter;
        else first = delimiter;
        last = delimiter;
        tokens.push(delimiter);
      }
      i = end;
    } else {
      text += char;
      i++;
    }
  }
  if (text) tokens.push(text);

  // Emphasis covers the tokens strictly between an opener and its closer.
  const bold = new Array<number>(tokens.length + 1).fill(0);
  const italic = new Array<number>(tokens.length + 1).fill(0);
  const openersBottom = new Map<number, Delimiter | null>();
  let closer = first;
  while (closer) {
    if (!closer.canClose) {
      closer = closer.next;
      continue;
    }
    const key = (closer.canOpen ? 3 : 0) + (closer.length % 3);
    const bottom = openersBottom.get(key) ?? null;
    let opener = closer.prev;
    while (opener && opener !== bottom && !canMatch(opener, closer)) opener = opener.prev;
    if (opener && opener !== bottom) {
      const use = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
      const depth = use === 2 ? bold : italic;
      depth[opener.token + 1]++;
      depth[closer.token]--;
      opener.count -= use;
      closer.count -= use;
      // Runs between the pair can no longer match anything.
      opener.next = closer;
      closer.prev = opener;
      if (opener.count === 0) unlink(opener);
      if (closer.count === 0) {
        unlink(closer);
        closer = closer.next;
      }
    } else {
      openersBottom.set(key, closer.prev);
      const next = closer.next;
      if (!closer.canOpen) unlink(closer);
      closer = next;
    }
  }

  let boldDepth = 0;
  let italicDepth = 0;
  tokens.forEach((token, index) => {
    boldDepth += bold[index];
    italicDepth += italic[index];
    const value = typeof token === 'string' ? token : '*'.repeat(token.count);
    appendRun(runs, value, boldDepth > 0, italicDepth > 0);
  });
}

function parseText(text: string): NoteRun[] {
  const runs: NoteRun[] = [];
  text.split('\n').forEach((line, index) => {
    if (index > 0) appendRun(runs, '\n', false, false);
    parseLine(line, runs);
  });
  return runs;
}

const CACHE_LIMIT = 500;
const cache = new Map<string, readonly NoteRun[]>();

/** The note's text as runs of plain, bold and italic text. Cheap for text without asterisks. */
export function parseNote(text: string): readonly NoteRun[] {
  if (!text.includes('*')) return text ? [{ text, bold: false, italic: false }] : [];
  let runs = cache.get(text);
  if (!runs) {
    runs = parseText(text);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(text, runs);
  }
  return runs;
}

/** Note text without its bold/italic markers, for one-line excerpts. */
export function plainNoteText(text: string): string {
  if (!text.includes('*')) return text;
  return parseNote(text)
    .map((run) => run.text)
    .join('');
}

/** Asterisks between word characters (neither space nor punctuation, as `classify` has it). */
const IN_WORD_ASTERISKS = /(?<=[^\s\p{P}\p{S}])\*+(?=[^\s\p{P}\p{S}])/gu;

/** Note text as Markdown, which reads emphasis inside words too: asterisks there are escaped. */
export function markdownNoteText(text: string): string {
  return text.replace(IN_WORD_ASTERISKS, (run) => '\\*'.repeat(run.length));
}

// ---- Serialising -------------------------------------------------------------

type Format = 'bold' | 'italic';

const MARKERS: Record<Format, string> = { bold: '**', italic: '*' };

/** One line as characters (code points), each with its formatting. */
interface Line {
  chars: string[];
  bold: boolean[];
  italic: boolean[];
}

interface Span {
  format: Format;
  start: number;
  end: number;
}

function spansOf(line: Line, format: Format): Span[] {
  const flags = line[format];
  const spans: Span[] = [];
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue;
    const start = i;
    while (flags[i + 1]) i++;
    spans.push({ format, start, end: i + 1 });
  }
  return spans;
}

/**
 * Escapes literal text: each asterisk becomes `\*` unless it is inside a word, and
 * backslashes that would otherwise escape what follows (an asterisk, or a marker) are doubled.
 */
function escapeLiteral(text: string, markerFollows: boolean): string {
  const escaped = text.replace(/(\\*)(\*+)/g, (run, slashes: string, stars: string, at: number) =>
    inWord(text, at + slashes.length, at + run.length)
      ? run
      : `${slashes}${slashes}${'\\*'.repeat(stars.length)}`,
  );
  return markerFollows ? escaped.replace(/\\+$/, (slashes) => slashes + slashes) : escaped;
}

const isSpace = (char: string) => SPACE.test(char);

/**
 * Formatting on a space is invisible, but Markdown cannot open emphasis before one or
 * close it after one. A space takes a format only when the text on both sides has it.
 */
function settleSpaces(line: Line): void {
  for (const format of ['bold', 'italic'] as const) {
    const flags = line[format];
    let before = false;
    for (let i = 0; i < flags.length; i++) {
      if (!isSpace(line.chars[i])) {
        before = flags[i];
        continue;
      }
      let next = i;
      while (next < flags.length && isSpace(line.chars[next])) next++;
      flags.fill(before && flags[next] === true, i, next);
      i = next - 1;
    }
  }
}

/**
 * Writes a line with markers, closing and reopening formats as needed to keep them
 * nested. Literal text is written as is, or escaped.
 */
function writeLine({ chars, bold, italic }: Line, escaped: boolean): string {
  const spanEnd = (format: Format, from: number) => {
    const flags = format === 'bold' ? bold : italic;
    let end = from;
    while (flags[end]) end++;
    return end;
  };
  const open: Format[] = [];
  let out = '';
  let literal = '';
  const flush = (markerFollows: boolean) => {
    out += escaped ? escapeLiteral(literal, markerFollows) : literal;
    literal = '';
  };
  const mark = (format: Format) => {
    flush(true);
    out += MARKERS[format];
  };
  for (let i = 0; i <= chars.length; i++) {
    const wanted = { bold: bold[i] === true, italic: italic[i] === true };
    const stale = open.findIndex((format) => !wanted[format]);
    if (stale !== -1) {
      for (const format of open.splice(stale).reverse()) mark(format);
    }
    // A format closed only to close another inside it reopens at the next word.
    if (i < chars.length && !isSpace(chars[i])) {
      const opening = (['bold', 'italic'] as const).filter(
        (format) => wanted[format] && !open.includes(format),
      );
      // The format that runs longer opens first, so it can stay open around the other.
      opening.sort((a, b) => spanEnd(b, i) - spanEnd(a, i));
      for (const format of opening) {
        mark(format);
        open.push(format);
      }
    }
    if (i < chars.length) literal += chars[i];
  }
  flush(false);
  return out;
}

/** True when `written` parses back to the line's text, with its formatting on everything but spaces. */
function readsBackAs(written: string, line: Line): boolean {
  const runs: NoteRun[] = [];
  parseLine(written, runs);
  let i = 0;
  for (const run of runs) {
    for (const char of run.text) {
      if (char !== line.chars[i]) return false;
      if (!isSpace(char) && (run.bold !== line.bold[i] || run.italic !== line.italic[i])) return false;
      i++;
    }
  }
  return i === line.chars.length;
}

/** The line as written: literal asterisks as typed when they cannot be misread, else escaped. */
function written(line: Line): string | null {
  const raw = writeLine(line, false);
  if (readsBackAs(raw, line)) return raw;
  const escaped = writeLine(line, true);
  return escaped !== raw && readsBackAs(escaped, line) ? escaped : null;
}

function withSpan(line: Line, span: Span): Line {
  const flags = [...line[span.format]];
  flags.fill(true, span.start, span.end);
  return { ...line, [span.format]: flags };
}

/** The whole words in the span: without part-words, spaces and punctuation at its edges. */
function wordsOf(line: Line, span: Span): Span {
  const isWord = (i: number) => classify(line.chars[i] ?? '') === 'other';
  let { start, end } = span;
  if (isWord(start - 1)) while (start < end && isWord(start)) start++;
  while (start < end && !isWord(start)) start++;
  if (isWord(end)) while (end > start && isWord(end - 1)) end--;
  while (end > start && !isWord(end - 1)) end--;
  return { ...span, start, end };
}

/**
 * Writes one line. Formatting whose markers would not read back (on part of a word, or
 * starting or ending with punctuation right against a letter, or formats overlapping inside
 * a word) is narrowed to the whole words it covers, or else dropped — the text itself always
 * survives.
 */
function serializeLine(line: Line): string {
  settleSpaces(line);
  const whole = written(line);
  if (whole !== null) return whole;

  const spans = [...spansOf(line, 'bold'), ...spansOf(line, 'italic')].sort((a, b) => a.start - b.start);
  let kept: Line = {
    chars: line.chars,
    bold: line.bold.map(() => false),
    italic: line.italic.map(() => false),
  };
  for (const span of spans) {
    for (const candidate of [span, wordsOf(line, span)]) {
      if (candidate.start >= candidate.end) continue;
      const next = withSpan(kept, candidate);
      if (written(next) !== null) {
        kept = next;
        break;
      }
    }
  }
  // Fully escaped, plain text always reads back.
  return written(kept) ?? writeLine(kept, true);
}

/**
 * Writes runs as note text: markers for bold and italic, and `\*` for a literal asterisk
 * wherever it could otherwise be read as a marker.
 */
export function serializeNote(runs: readonly NoteRun[]): string {
  const lines: Line[] = [{ chars: [], bold: [], italic: [] }];
  for (const run of runs) {
    for (const char of run.text) {
      if (char === '\n') {
        lines.push({ chars: [], bold: [], italic: [] });
        continue;
      }
      const line = lines[lines.length - 1];
      line.chars.push(char);
      line.bold.push(run.bold);
      line.italic.push(run.italic);
    }
  }
  return lines
    .map((line) =>
      line.chars.includes('*') || line.bold.includes(true) || line.italic.includes(true)
        ? serializeLine(line)
        : line.chars.join(''),
    )
    .join('\n');
}
