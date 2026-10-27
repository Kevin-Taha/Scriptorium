import { NOTE_COLORS, type MarginNote, type NoteColor } from '@/lib/types';

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

function searchableText(note: MarginNote): string {
  let text = searchableCache.get(note);
  if (text === undefined) {
    text = foldText(note.quote ? `${note.text}\n${note.quote}` : note.text);
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

/** True when both lists hold exactly the same note objects, in the same order. */
export function sameNotes(a: MarginNote[], b: MarginNote[]): boolean {
  return a === b || (a.length === b.length && a.every((note, i) => note === b[i]));
}
