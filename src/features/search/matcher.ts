import { cleanText, foldText, type PageText } from './pageText';

/** A query prepared for matching against {@link PageText.folded}. */
export interface Matcher {
  /** The query as the reader typed it, cleaned up (single spaces, trimmed). */
  query: string;
  /** Folded query (case, diacritics, quote styles), compared with `PageText.folded`. */
  needle: string;
}

export interface MatchRange {
  /** Offsets into `PageText.text`. */
  start: number;
  end: number;
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export function createMatcher(rawQuery: string): Matcher | null {
  const query = cleanText(rawQuery);
  return query === '' ? null : { query, needle: foldText(query) };
}

/** Finds non-overlapping matches of `matcher` on a page, in reading order. */
export function findMatches({ folded }: PageText, { needle }: Matcher, limit = Infinity): MatchRange[] {
  const matches: MatchRange[] = [];
  for (let start = folded.indexOf(needle); start !== -1 && matches.length < limit; ) {
    matches.push({ start, end: start + needle.length });
    start = folded.indexOf(needle, start + needle.length);
  }
  return matches;
}
/** Context kept on each side of a match in a result row. */
const CONTEXT = 40;
/** How far a snippet edge may move to land on a word boundary. */
const EDGE_SLACK = 12;

/** The match with ~40 characters of context each side, trimmed to word boundaries. */
export function buildSnippet(text: string, start: number, end: number, context = CONTEXT): Snippet {
  let from = Math.max(0, start - context);
  let to = Math.min(text.length, end + context);

  if (from > 0 && text[from - 1] !== ' ' && text[from] !== ' ') {
    const space = text.indexOf(' ', from);
    if (space !== -1 && space < start && space - from <= EDGE_SLACK) from = space + 1;
  }
  if (to < text.length && text[to - 1] !== ' ' && text[to] !== ' ') {
    const space = text.lastIndexOf(' ', to);
    if (space > end && to - space <= EDGE_SLACK) to = space;
  }

  return {
    before: (from > 0 ? '…' : '') + text.slice(from, start).trimStart(),
    match: text.slice(start, end),
    after: text.slice(end, to).trimEnd() + (to < text.length ? '…' : ''),
  };
}
