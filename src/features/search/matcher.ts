import { cleanText, foldText, isWordChar, type PageText } from './pageText';

export interface SearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
}

export const DEFAULT_OPTIONS: SearchOptions = { matchCase: false, wholeWord: false };

/** A query prepared for matching against {@link PageText.folded}. */
export interface Matcher {
  /** The query as the reader typed it, cleaned up (single spaces, trimmed). */
  query: string;
  /** Folded query (case, diacritics, quote styles), compared with `PageText.folded`. */
  needle: string;
  /** Case-preserving fold of the query; set only when matching case. */
  caseNeedle: string | null;
  wholeWord: boolean;
  /** Whole-word checks apply only at query edges that are word characters (so "C++" still works). */
  wordAtStart: boolean;
  wordAtEnd: boolean;
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

export function createMatcher(rawQuery: string, options: SearchOptions): Matcher | null {
  const query = cleanText(rawQuery);
  if (query === '') return null;
  const needle = foldText(query);
  return {
    query,
    needle,
    caseNeedle: options.matchCase ? foldText(query, false) : null,
    wholeWord: options.wholeWord,
    wordAtStart: isWordChar(needle[0]),
    wordAtEnd: isWordChar(needle.at(-1)),
  };
}

/** Finds non-overlapping matches of `matcher` on a page, in reading order. */
export function findMatches(pageText: PageText, matcher: Matcher, limit = Infinity): MatchRange[] {
  const { folded, text } = pageText;
  const { needle, caseNeedle } = matcher;
  const matches: MatchRange[] = [];
  let from = 0;
  while (matches.length < limit) {
    const start = folded.indexOf(needle, from);
    if (start === -1) break;
    const end = start + needle.length;
    const accepted =
      (!matcher.wholeWord || isWholeWord(folded, start, end, matcher)) &&
      (caseNeedle === null || foldText(text.slice(start, end), false) === caseNeedle);
    if (accepted) {
      matches.push({ start, end });
      from = end;
    } else {
      from = start + 1;
    }
  }
  return matches;
}

function isWholeWord(folded: string, start: number, end: number, matcher: Matcher): boolean {
  if (matcher.wordAtStart && start > 0 && isWordChar(folded[start - 1])) return false;
  if (matcher.wordAtEnd && end < folded.length && isWordChar(folded[end])) return false;
  return true;
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
