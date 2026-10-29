import { NOTE_COLORS, type MarginNote, type NoteColor } from '@/lib/types';
import { annotationColors, type AnnotationItem } from './annotations';
import { type NoteRun, plainNoteText } from './noteFormat';

export interface ReviewFilters {
  query: string;
  colors: NoteColor[];
}

export const NO_FILTERS: ReviewFilters = { query: '', colors: [] };

export function hasActiveFilters({ query, colors }: ReviewFilters): boolean {
  return query.trim() !== '' || colors.length > 0;
}

/** Lower-cases and removes diacritics so "Schrödinger" matches "schrodinger". */
function foldCharacter(char: string): string {
  return char
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

export function foldText(text: string): string {
  return Array.from(text, foldCharacter).join('');
}

/** Distinct, folded search words; a note must contain all of them. */
export function searchTerms(query: string): string[] {
  return [...new Set(foldText(query).split(/\s+/).filter(Boolean))];
}

const searchableCache = new WeakMap<MarginNote, string>();

/** The note's words as the filter sees them: folded, without formatting markers. */
function searchableText(note: MarginNote): string {
  let text = searchableCache.get(note);
  if (text === undefined) {
    const noteText = plainNoteText(note.text);
    text = foldText(note.quote ? `${noteText}\n${note.quote}` : noteText);
    searchableCache.set(note, text);
  }
  return text;
}

export function matchesFilters(note: MarginNote, terms: string[], colors: NoteColor[]): boolean {
  if (colors.length > 0 && !colors.includes(note.color)) return false;
  if (terms.length === 0) return true;
  const haystack = searchableText(note);
  return terms.every((term) => haystack.includes(term));
}

/**
 * Notes that satisfy the filters. `keepId` stays visible regardless, so a note
 * being edited does not vanish when its new text stops matching.
 */
export function filterNotes(
  notes: MarginNote[],
  filters: ReviewFilters,
  keepId: string | null = null,
): MarginNote[] {
  if (!hasActiveFilters(filters)) return notes;
  const terms = searchTerms(filters.query);
  return notes.filter((note) => note.id === keepId || matchesFilters(note, terms, filters.colors));
}

/** Adds or removes `color`, keeping the palette's order. */
export function toggleColor(colors: NoteColor[], color: NoteColor): NoteColor[] {
  const next = colors.includes(color) ? colors.filter((c) => c !== color) : [...colors, color];
  return NOTE_COLORS.filter((c) => next.includes(c));
}

export function countByColor(notes: MarginNote[]): Record<NoteColor, number> {
  const counts = { amber: 0, sage: 0, sky: 0, rose: 0, lavender: 0 };
  for (const note of notes) counts[note.color] += 1;
  return counts;
}

// ---- Notes and highlights together -------------------------------------------

const highlightTextCache = new WeakMap<object, string>();

function itemSearchableText(item: AnnotationItem): string {
  if (item.kind === 'note') {
    const noteText = searchableText(item.note);
    return item.highlight ? `${noteText}\n${foldedHighlightText(item.highlight)}` : noteText;
  }
  return foldedHighlightText(item.highlight);
}

function foldedHighlightText(highlight: { text: string }): string {
  let text = highlightTextCache.get(highlight);
  if (text === undefined) {
    text = foldText(highlight.text);
    highlightTextCache.set(highlight, text);
  }
  return text;
}

/** A note or highlight satisfies the colour filter if any colour it carries is selected. */
export function matchesItemFilters(item: AnnotationItem, terms: string[], colors: NoteColor[]): boolean {
  if (colors.length > 0 && !annotationColors(item).some((color) => colors.includes(color))) return false;
  if (terms.length === 0) return true;
  const haystack = itemSearchableText(item);
  return terms.every((term) => haystack.includes(term));
}

/** Like `filterNotes`, for the review's mixed list; `keepId` (the note being edited) always stays. */
export function filterAnnotations(
  items: AnnotationItem[],
  filters: ReviewFilters,
  keepId: string | null = null,
): AnnotationItem[] {
  if (!hasActiveFilters(filters)) return items;
  const terms = searchTerms(filters.query);
  return items.filter((item) => item.id === keepId || matchesItemFilters(item, terms, filters.colors));
}

/** Items per colour; an item counts under every colour it carries. */
export function countAnnotationsByColor(items: AnnotationItem[]): Record<NoteColor, number> {
  const counts = { amber: 0, sage: 0, sky: 0, rose: 0, lavender: 0 };
  for (const item of items) for (const color of annotationColors(item)) counts[color] += 1;
  return counts;
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/** Splits `text` into runs, marking those that match any of the folded `terms`. */
export function highlightSegments(text: string, terms: string[]): TextSegment[] {
  if (terms.length === 0 || text === '') return [{ text, match: false }];

  // Folding can change length (e.g. "é" → "e"), so remember where each folded unit came from.
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const char of text) {
    const piece = foldCharacter(char);
    for (let i = 0; i < piece.length; i++) {
      starts.push(index);
      ends.push(index + char.length);
    }
    folded += piece;
    index += char.length;
  }

  const covered: [number, number][] = [];
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      covered.push([starts[at], ends[at + term.length - 1]]);
    }
  }
  if (covered.length === 0) return [{ text, match: false }];

  covered.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of covered) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}

export interface MarkedRun extends NoteRun {
  match: boolean;
}

/** Formatted note text split where the search terms match, so marks can sit inside bold or italic. */
export function markRuns(runs: readonly NoteRun[], terms: string[]): MarkedRun[] {
  if (terms.length === 0) return runs.map((run) => ({ ...run, match: false }));
  const marked: MarkedRun[] = [];
  let index = 0;
  let offset = 0;
  for (const segment of highlightSegments(runs.map((run) => run.text).join(''), terms)) {
    let remaining = segment.text.length;
    while (remaining > 0) {
      const run = runs[index];
      const take = Math.min(remaining, run.text.length - offset);
      marked.push({ ...run, text: run.text.slice(offset, offset + take), match: segment.match });
      remaining -= take;
      offset += take;
      if (offset === run.text.length) {
        index++;
        offset = 0;
      }
    }
  }
  return marked;
}

/** True when both lists hold exactly the same note objects, in the same order. */
export function sameNotes(a: MarginNote[], b: MarginNote[]): boolean {
  return a === b || (a.length === b.length && a.every((note, i) => note === b[i]));
}
