import type { Inline } from './ast';

interface Delimiter {
  kind: 'delim';
  ch: '*' | '_' | '~';
  count: number;
  original: number;
  canOpen: boolean;
  canClose: boolean;
}

type Item = Inline | Delimiter;

/** Characters a backslash can escape. `\(` and `\[` are maths delimiters and handled separately. */
const ESCAPABLE = '\\$*_`~#>-+|!';
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const URL_AT = /https?:\/\/[^\s<>]+/iy;
const SPACE = /\s/;
const PUNCTUATION = /[\p{P}\p{S}]/u;
const WORD = /[\p{L}\p{N}]/u;
const DIGIT = /\d/;

const isSpace = (char: string | undefined) => char === undefined || SPACE.test(char);
const isPunctuation = (char: string | undefined) => char !== undefined && PUNCTUATION.test(char);
const isDelimiter = (item: Item): item is Delimiter => 'kind' in item;

/** `http`, `https` and `mailto` links only: anything else (javascript:, data:, relative) is not a link. */
export function safeHref(raw: string): string | null {
  const candidate = raw.trim().replace(/^<(.*)>$/, '$1');
  try {
    const url = new URL(candidate);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Index of the first `close` at or after `from`, skipping backslash-escaped characters. */
export function findClose(src: string, from: number, close: string): number {
  for (let i = from; i < src.length; i++) {
    if (src.startsWith(close, i)) return i;
    if (src[i] === '\\') i++;
  }
  return -1;
}

function delimitedMath(src: string, i: number, close: string, display: boolean): [Inline, number] | null {
  const from = i + 2;
  const end = findClose(src, from, close);
  if (end < 0) return null;
  const value = src.slice(from, end).trim();
  return value ? [{ type: 'math', value, display }, end + close.length] : null;
}

/** Pandoc's rule for `$…$`: no space inside either delimiter, and no digit right after the closing one. */
function dollarMath(src: string, i: number): [Inline, number] | null {
  if (isSpace(src[i + 1])) return null;
  for (let j = i + 1; j < src.length; j++) {
    const char = src[j];
    if (char === '\\') {
      j++;
    } else if (char === '$') {
      if (isSpace(src[j - 1])) return null;
      if (DIGIT.test(src[j + 1] ?? '')) continue;
      return [{ type: 'math', value: src.slice(i + 1, j), display: false }, j + 1];
    }
  }
  return null;
}

function matchMath(src: string, i: number): [Inline, number] | null {
  if (src.startsWith('\\(', i)) return delimitedMath(src, i, '\\)', false);
  if (src.startsWith('\\[', i)) return delimitedMath(src, i, '\\]', true);
  if (src[i] !== '$') return null;
  return src[i + 1] === '$' ? delimitedMath(src, i, '$$', true) : dollarMath(src, i);
}

function matchCode(src: string, i: number): [Inline, number] | null {
  let ticks = 0;
  while (src[i + ticks] === '`') ticks++;
  let from = i + ticks;
  for (;;) {
    const start = src.indexOf('`', from);
    if (start < 0) return null;
    let run = 0;
    while (src[start + run] === '`') run++;
    if (run === ticks) {
      let value = src.slice(i + ticks, start).replace(/\n/g, ' ');
      if (value.length > 2 && value.startsWith(' ') && value.endsWith(' ')) value = value.slice(1, -1);
      return [{ type: 'code', value }, start + run];
    }
    from = start + run;
  }
}

function matchLink(src: string, i: number): [Inline, number] | null {
  let depth = 0;
  let close = i + 1;
  for (; close < src.length; close++) {
    const char = src[close];
    if (char === '\\') {
      close++;
    } else if (char === '`') {
      const code = matchCode(src, close);
      if (code) close = code[1] - 1;
    } else if (char === '[') {
      depth++;
    } else if (char === ']') {
      if (depth === 0) break;
      depth--;
    }
  }
  if (close >= src.length || src[close + 1] !== '(') return null;

  let end = close + 2;
  let parens = 0;
  for (; end < src.length; end++) {
    const char = src[end];
    if (char === '\n') return null;
    if (char === '\\') end++;
    else if (char === '(') parens++;
    else if (char === ')') {
      if (parens === 0) break;
      parens--;
    }
  }
  if (end >= src.length) return null;

  const destination = src
    .slice(close + 2, end)
    .trim()
    .split(/\s+/)[0];
  const href = safeHref(destination);
  const label = src.slice(i + 1, close);
  if (!href || !label.trim()) return null;
  return [{ type: 'link', href, children: parseInline(label, true) }, end + 1];
}

function count(text: string, char: string): number {
  let n = 0;
  for (const c of text) if (c === char) n++;
  return n;
}

function matchAutolink(src: string, i: number): [Inline, number] | null {
  URL_AT.lastIndex = i;
  const match = URL_AT.exec(src);
  if (!match) return null;
  let url = match[0];
  for (;;) {
    const last = url.at(-1) ?? '';
    if (last !== '' && '.,;:!?\'"*_~'.includes(last)) url = url.slice(0, -1);
    else if (last === ')' && count(url, ')') > count(url, '(')) url = url.slice(0, -1);
    else break;
  }
  const href = safeHref(url);
  return href ? [{ type: 'link', href, children: [{ type: 'text', value: url }] }, i + url.length] : null;
}

function delimiterRun(src: string, i: number, ch: Delimiter['ch']): Delimiter | null {
  let run = 1;
  while (src[i + run] === ch) run++;
  if (ch === '~' && run !== 2) return null;

  const before = src[i - 1];
  const after = src[i + run];
  const spaceBefore = isSpace(before);
  const spaceAfter = isSpace(after);
  const punctuationBefore = isPunctuation(before);
  const punctuationAfter = isPunctuation(after);
  const leftFlanking = !spaceAfter && (!punctuationAfter || spaceBefore || punctuationBefore);
  const rightFlanking = !spaceBefore && (!punctuationBefore || spaceAfter || punctuationAfter);
  const canOpen = ch === '_' ? leftFlanking && (!rightFlanking || punctuationBefore) : leftFlanking;
  const canClose = ch === '_' ? rightFlanking && (!leftFlanking || punctuationAfter) : rightFlanking;
  if (!canOpen && !canClose) return null;
  return { kind: 'delim', ch, count: run, original: run, canOpen, canClose };
}

function pushText(out: Inline[], value: string): void {
  const last = out.at(-1);
  if (last?.type === 'text') last.value += value;
  else out.push({ type: 'text', value });
}

/** Unmatched delimiters become literal text; adjacent text merges. */
function finalize(items: Item[]): Inline[] {
  const out: Inline[] = [];
  for (const item of items) {
    if (isDelimiter(item)) {
      if (item.count > 0) pushText(out, item.ch.repeat(item.count));
    } else if (item.type === 'text') {
      pushText(out, item.value);
    } else {
      out.push(item);
    }
  }
  return out;
}

function canPair(opener: Delimiter, closer: Delimiter): boolean {
  if (closer.ch === '~') return true;
  const either = opener.canClose || closer.canOpen;
  const sum = opener.original + closer.original;
  return !(either && sum % 3 === 0 && !(opener.original % 3 === 0 && closer.original % 3 === 0));
}

/** CommonMark's delimiter-stack pairing of `*`, `_` and `~~` runs into em / strong / del. */
function pairEmphasis(items: Item[]): Item[] {
  let i = 0;
  while (i < items.length) {
    const closer = items[i];
    if (!isDelimiter(closer) || !closer.canClose || closer.count === 0) {
      i++;
      continue;
    }
    let o = i - 1;
    for (; o >= 0; o--) {
      const candidate = items[o];
      if (
        isDelimiter(candidate) &&
        candidate.ch === closer.ch &&
        candidate.canOpen &&
        candidate.count > 0 &&
        canPair(candidate, closer)
      ) {
        break;
      }
    }
    if (o < 0) {
      i++;
      continue;
    }
    const opener = items[o] as Delimiter;
    const used = closer.ch === '~' || (opener.count >= 2 && closer.count >= 2) ? 2 : 1;
    const children = finalize(items.slice(o + 1, i));
    const type = closer.ch === '~' ? 'del' : used === 2 ? 'strong' : 'em';
    opener.count -= used;
    closer.count -= used;
    items.splice(o + 1, i - o - 1, { type, children });
    i = o + 2;
  }
  return items;
}

/** Parses one paragraph's worth of text: emphasis, code, links, maths and line breaks. */
export function parseInline(src: string, inLink = false): Inline[] {
  const items: Item[] = [];
  let buffer = '';
  const push = (node: Item) => {
    if (buffer) items.push({ type: 'text', value: buffer });
    buffer = '';
    items.push(node);
  };

  let i = 0;
  while (i < src.length) {
    const char = src[i];

    if (char === '\\') {
      const next = src[i + 1];
      const math = next === '(' || next === '[' ? matchMath(src, i) : null;
      if (math) {
        push(math[0]);
        i = math[1];
      } else if (next === '(' || next === '[') {
        buffer += char + next;
        i += 2;
      } else if (next !== undefined && ESCAPABLE.includes(next)) {
        buffer += next;
        i += 2;
      } else {
        buffer += char;
        i++;
      }
      continue;
    }

    if (char === '$') {
      const math = matchMath(src, i);
      if (math) {
        push(math[0]);
        i = math[1];
      } else {
        const length = src[i + 1] === '$' ? 2 : 1;
        buffer += src.slice(i, i + length);
        i += length;
      }
      continue;
    }

    if (char === '`') {
      const code = matchCode(src, i);
      if (code) {
        push(code[0]);
        i = code[1];
      } else {
        let ticks = 0;
        while (src[i + ticks] === '`') ticks++;
        buffer += '`'.repeat(ticks);
        i += ticks;
      }
      continue;
    }

    if (char === '[' && !inLink) {
      const link = matchLink(src, i);
      if (link) {
        push(link[0]);
        i = link[1];
        continue;
      }
    }

    if ((char === 'h' || char === 'H') && !inLink && !WORD.test(src[i - 1] ?? '')) {
      const link = matchAutolink(src, i);
      if (link) {
        push(link[0]);
        i = link[1];
        continue;
      }
    }

    if (char === '\n') {
      buffer = buffer.replace(/[ \t]+$/, '');
      push({ type: 'br' });
      i++;
      while (src[i] === ' ' || src[i] === '\t') i++;
      continue;
    }

    if (char === '*' || char === '_' || char === '~') {
      const delimiter = delimiterRun(src, i, char);
      let run = 1;
      while (src[i + run] === char) run++;
      if (delimiter) push(delimiter);
      else buffer += char.repeat(run);
      i += run;
      continue;
    }

    buffer += char;
    i++;
  }
  if (buffer) items.push({ type: 'text', value: buffer });
  return finalize(pairEmphasis(items));
}
