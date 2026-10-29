/**
 * Note text is plain text in which `**bold**` and `*italic*` mark emphasis on whole words. A run
 * of asterisks opens emphasis only when no word character precedes it, and closes it only when
 * none follows, so asterisks inside a word ("2*3*4", "x**2") are always text and notes written
 * before formatting keep their meaning. Emphasis stays within a line. A literal asterisk that
 * could read as a marker is stored as `\*`; backslashes matter only right before an asterisk,
 * where a run of them halves.
 */

export interface NoteRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

const SPACE = /\s/u;
const NOT_WORD = /[\s\p{P}\p{S}]/u;
const IN_WORD_ASTERISKS = /(?<=[^\s\p{P}\p{S}])\*+(?=[^\s\p{P}\p{S}])/gu;
const isSpace = (char?: string) => char === undefined || SPACE.test(char);
const isWord = (char?: string) => char !== undefined && !NOT_WORD.test(char);

function appendRun(runs: NoteRun[], text: string, bold: boolean, italic: boolean): void {
  if (!text) return;
  const last = runs.at(-1);
  if (last && last.bold === bold && last.italic === italic) last.text += text;
  else runs.push({ text, bold, italic });
}

/** A run of asterisks, with `count` of them not yet matched. */
type Delimiter = { token: number; count: number };

function parseLine(line: string, runs: NoteRun[]): void {
  const chars = Array.from(line);
  const tokens: (string | Delimiter)[] = [];
  const openers: Delimiter[] = [];
  // Changes in emphasis depth per token: it covers the tokens between an opener and its closer.
  const bold = new Array<number>(2 * chars.length + 2).fill(0);
  const italic = [...bold];
  let text = '';
  let i = 0;
  while (i < chars.length) {
    let end = i;
    if (chars[i] === '\\') {
      while (chars[end] === '\\') end++;
      const escapes = chars[end] === '*';
      text += '\\'.repeat(escapes ? (end - i) >> 1 : end - i);
      if (escapes && (end - i) % 2) text += chars[end++];
    } else if (chars[i] === '*') {
      while (chars[end] === '*') end++;
      const canOpen = !isSpace(chars[end]) && !isWord(chars[i - 1]);
      const canClose = !isSpace(chars[i - 1]) && !isWord(chars[end]);
      if (canOpen || canClose) {
        tokens.push(text);
        text = '';
        const run: Delimiter = { token: tokens.length, count: end - i };
        tokens.push(run);
        while (canClose && run.count > 0 && openers.length > 0) {
          const opener = openers[openers.length - 1];
          const use = opener.count > 1 && run.count > 1 ? 2 : 1;
          const depth = use === 2 ? bold : italic;
          depth[opener.token + 1]++;
          depth[run.token]--;
          opener.count -= use;
          run.count -= use;
          if (opener.count === 0) openers.pop();
        }
        if (canOpen && run.count > 0) openers.push(run);
      } else {
        text += '*'.repeat(end - i);
      }
    } else {
      text += chars[end++];
    }
    i = end;
  }
  tokens.push(text);

  let boldDepth = 0;
  let italicDepth = 0;
  tokens.forEach((token, index) => {
    boldDepth += bold[index];
    italicDepth += italic[index];
    const value = typeof token === 'string' ? token : '*'.repeat(token.count);
    appendRun(runs, value, boldDepth > 0, italicDepth > 0);
  });
}

/** The note's text as runs of plain, bold and italic text. */
export function parseNote(text: string): NoteRun[] {
  const runs: NoteRun[] = [];
  text.split('\n').forEach((line, index) => {
    if (index > 0) appendRun(runs, '\n', false, false);
    parseLine(line, runs);
  });
  return runs;
}

/** Note text without its bold/italic markers, for excerpts and search. */
export function plainNoteText(text: string): string {
  if (!text.includes('*')) return text;
  return parseNote(text)
    .map((run) => run.text)
    .join('');
}

/** Note text as Markdown, which reads emphasis inside words too: asterisks there are escaped. */
export function markdownNoteText(text: string): string {
  return text.replace(IN_WORD_ASTERISKS, (run) => '\\*'.repeat(run.length));
}

const BOLD = 1;
const ITALIC = 2;

/**
 * Writes runs as note text. Markers go only where they read back one way: before a word or
 * after a space to open, after a word or before a space to close. Formatting that can't be
 * marked where it is keeps just the whole words it covers; the text itself always survives.
 */
export function serializeNote(runs: readonly NoteRun[]): string {
  const chars = runs.flatMap((run) => Array.from(run.text));
  const formats = runs.flatMap((run) =>
    Array.from(run.text, (char) => (char === '\n' ? 0 : (run.bold ? BOLD : 0) | (run.italic ? ITALIC : 0))),
  );
  // Asterisks inside a word are part of it.
  const shape = chars.join('').replace(IN_WORD_ASTERISKS, (run) => 'a'.repeat(run.length));
  const word = Array.from(shape, (char) => isWord(char));
  const space = (i: number) => isSpace(chars[i]);
  const opens = (i: number) => !space(i) && !word[i - 1] && (word[i] || space(i - 1));
  const closes = (i: number) => !space(i - 1) && !word[i] && (word[i - 1] || space(i));

  const wanted = formats.map(() => 0);
  for (const format of [BOLD, ITALIC]) {
    for (let i = 0; i < chars.length; i++) {
      if (!(formats[i] & format)) continue;
      let start = i;
      while (formats[i] & format) i++;
      let end = i;
      while (start < end && space(start)) start++;
      while (end > start && space(end - 1)) end--;
      if (!opens(start) || !closes(end)) {
        while (start < end && !(word[start] && !word[start - 1])) start++;
        while (end > start && !(word[end - 1] && !word[end])) end--;
      }
      for (let j = start; j < end; j++) wanted[j] |= format;
    }
  }

  const spanEnd = (format: number, from: number) => {
    let end = from;
    while (wanted[end] & format) end++;
    return end;
  };
  const write = (escaping: boolean) => {
    const open: number[] = [];
    let out = '';
    let slashes = '';
    const flush = (asteriskNext: boolean) => {
      out += escaping && asteriskNext ? slashes + slashes : slashes;
      slashes = '';
    };
    const mark = (format: number) => {
      flush(true);
      out += format === BOLD ? '**' : '*';
    };
    for (let i = 0; i <= chars.length; i++) {
      const want = wanted[i] ?? 0;
      const stale = open.findIndex((format) => !(want & format));
      if (stale !== -1) for (const format of open.splice(stale).reverse()) mark(format);
      // The longer format opens outside. One closed early, to close a format outside it, reopens at the next word.
      if (opens(i)) {
        const opening = [BOLD, ITALIC].filter((format) => want & format && !open.includes(format));
        opening.sort((a, b) => spanEnd(b, i) - spanEnd(a, i));
        for (const format of opening) {
          mark(format);
          open.push(format);
        }
      }
      const char = chars[i];
      if (char === '\\') {
        slashes += char;
      } else if (char === '*' && escaping && !word[i]) {
        flush(true);
        out += '\\*';
      } else if (char !== undefined) {
        flush(false);
        out += char;
      }
    }
    flush(false);
    return out;
  };

  // Literal asterisks stay as typed unless that changes how the note reads.
  const escaped = write(true);
  const raw = write(false);
  const read = (written: string) => JSON.stringify(parseNote(written));
  return raw === escaped || read(raw) === read(escaped) ? raw : escaped;
}
