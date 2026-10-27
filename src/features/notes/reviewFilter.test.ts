import { describe, expect, it } from 'vitest';
import type { Highlight, MarginNote } from '@/lib/types';
import { buildAnnotations } from './annotations';
import {
  NO_FILTERS,
  countAnnotationsByColor,
  countByColor,
  filterAnnotations,
  filterNotes,
  foldText,
  hasActiveFilters,
  highlightSegments,
  matchesFilters,
  matchesItemFilters,
  sameNotes,
  searchTerms,
  toggleColor,
} from './reviewFilter';

let sequence = 0;
function note(overrides: Partial<MarginNote> = {}): MarginNote {
  sequence += 1;
  return {
    id: `n${sequence}`,
    docId: 'doc',
    page: 1,
    y: 0.5,
    text: 'text',
    color: 'amber',
    createdAt: sequence,
    updatedAt: sequence,
    ...overrides,
  };
}

describe('foldText and searchTerms', () => {
  it('lower-cases and strips diacritics', () => {
    expect(foldText('Schrödinger’s Équation')).toBe('schrodinger’s equation');
  });

  it('splits a query into distinct folded words', () => {
    expect(searchTerms('  Newton  LAW newton ')).toEqual(['newton', 'law']);
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('matchesFilters', () => {
  const n = note({ text: 'Newton’s second law', quote: 'F = ma', color: 'sky' });

  it('matches note text and quotes, case-insensitively', () => {
    expect(matchesFilters(n, searchTerms('NEWTON'), [])).toBe(true);
    expect(matchesFilters(n, searchTerms('f = MA'), [])).toBe(true);
    expect(matchesFilters(n, searchTerms('third'), [])).toBe(false);
  });

  it('requires every word to appear somewhere in the note', () => {
    expect(matchesFilters(n, searchTerms('law f'), [])).toBe(true);
    expect(matchesFilters(n, searchTerms('law third'), [])).toBe(false);
  });

  it('matches any selected colour', () => {
    expect(matchesFilters(n, [], ['rose', 'sky'])).toBe(true);
    expect(matchesFilters(n, [], ['rose'])).toBe(false);
  });

  it('combines text and colour filters', () => {
    expect(matchesFilters(n, searchTerms('law'), ['rose'])).toBe(false);
    expect(matchesFilters(n, searchTerms('law'), ['sky'])).toBe(true);
  });
});

describe('filterNotes', () => {
  const notes = [
    note({ id: 'a', text: 'Momentum is conserved', color: 'amber' }),
    note({ id: 'b', text: 'Energy is conserved', color: 'sage' }),
    note({ id: 'c', text: 'Friction', quote: 'conserved quantities', color: 'sage' }),
  ];

  it('returns the same array when no filter is active', () => {
    expect(filterNotes(notes, NO_FILTERS)).toBe(notes);
    expect(filterNotes(notes, { query: '  ', colors: [] })).toBe(notes);
  });

  it('filters by text, quote and colour', () => {
    expect(filterNotes(notes, { query: 'conserved', colors: [] }).map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(filterNotes(notes, { query: 'conserved', colors: ['sage'] }).map((n) => n.id)).toEqual(['b', 'c']);
    expect(filterNotes(notes, { query: 'friction', colors: [] }).map((n) => n.id)).toEqual(['c']);
  });

  it('keeps the note being edited even when it no longer matches', () => {
    expect(filterNotes(notes, { query: 'momentum', colors: [] }, 'b').map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('hasActiveFilters', () => {
  it('is true for a non-blank query or any colour', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ query: ' x ', colors: [] })).toBe(true);
    expect(hasActiveFilters({ query: '', colors: ['rose'] })).toBe(true);
  });
});

describe('toggleColor', () => {
  it('adds and removes colours in palette order', () => {
    expect(toggleColor([], 'rose')).toEqual(['rose']);
    expect(toggleColor(['rose'], 'amber')).toEqual(['amber', 'rose']);
    expect(toggleColor(['amber', 'rose'], 'amber')).toEqual(['rose']);
  });
});

describe('countByColor', () => {
  it('counts notes per colour', () => {
    const counts = countByColor([note({ color: 'sky' }), note({ color: 'sky' }), note({ color: 'rose' })]);
    expect(counts).toEqual({ amber: 0, sage: 0, sky: 2, rose: 1, lavender: 0 });
  });
});

describe('highlightSegments', () => {
  it('returns one plain segment without terms or matches', () => {
    expect(highlightSegments('Hello', [])).toEqual([{ text: 'Hello', match: false }]);
    expect(highlightSegments('Hello', ['xyz'])).toEqual([{ text: 'Hello', match: false }]);
    expect(highlightSegments('', ['a'])).toEqual([{ text: '', match: false }]);
  });

  it('marks every occurrence, preserving the original casing', () => {
    expect(highlightSegments('Force and FORCE and force', ['force'])).toEqual([
      { text: 'Force', match: true },
      { text: ' and ', match: false },
      { text: 'FORCE', match: true },
      { text: ' and ', match: false },
      { text: 'force', match: true },
    ]);
  });

  it('merges overlapping matches from different terms', () => {
    expect(highlightSegments('conservation', ['conserv', 'vation'])).toEqual([
      { text: 'conservation', match: true },
    ]);
    expect(highlightSegments('a conserved b', ['conse', 'served'])).toEqual([
      { text: 'a ', match: false },
      { text: 'conserved', match: true },
      { text: ' b', match: false },
    ]);
  });

  it('maps matches back through accent folding', () => {
    expect(highlightSegments('Le Schrödinger équation', ['schrodinger', 'equation'])).toEqual([
      { text: 'Le ', match: false },
      { text: 'Schrödinger', match: true },
      { text: ' ', match: false },
      { text: 'équation', match: true },
    ]);
  });

  it('handles astral characters', () => {
    expect(highlightSegments('📚 book 📚', ['book'])).toEqual([
      { text: '📚 ', match: false },
      { text: 'book', match: true },
      { text: ' 📚', match: false },
    ]);
  });
});

describe('sameNotes', () => {
  const a = note();
  const b = note();

  it('compares note identity and order', () => {
    expect(sameNotes([a, b], [a, b])).toBe(true);
    expect(sameNotes([a, b], [b, a])).toBe(false);
    expect(sameNotes([a], [a, b])).toBe(false);
    expect(sameNotes([a], [{ ...a, text: 'edited' }])).toBe(false);
  });
});

function highlight(overrides: Partial<Highlight> = {}): Highlight {
  sequence += 1;
  return {
    id: `h${sequence}`,
    docId: 'doc',
    page: 1,
    rects: [{ x: 0.1, y: 0.3, w: 0.5, h: 0.02 }],
    text: 'highlighted passage',
    color: 'sky',
    createdAt: sequence,
    updatedAt: sequence,
    ...overrides,
  };
}

describe('filtering notes and highlights together', () => {
  const plain = note({ id: 'plain', text: 'Entropy never decreases', color: 'amber' });
  const standalone = highlight({ id: 'standalone', text: 'Second law of thermodynamics', color: 'sage' });
  const linkedHighlight = highlight({ id: 'lh', text: 'Heat flows from hot to cold', color: 'sky' });
  const linkedNote = note({ id: 'linked', text: 'Why?', color: 'rose', highlightId: 'lh', y: 0.31 });
  const items = buildAnnotations([plain, linkedNote], [standalone, linkedHighlight]);

  it('returns the same array when no filter is active', () => {
    expect(filterAnnotations(items, NO_FILTERS)).toBe(items);
  });

  it('matches the text of highlights, and a linked note matches through its highlight', () => {
    const ids = (query: string) => filterAnnotations(items, { query, colors: [] }).map((i) => i.id);
    expect(ids('thermodynamics')).toEqual(['standalone']);
    expect(ids('hot cold')).toEqual(['linked']);
    expect(ids('hot entropy')).toEqual([]);
    expect(ids('hot')).toEqual(['linked']);
    expect(ids('why hot')).toEqual(['linked']);
    expect(ids('entropy')).toEqual(['plain']);
  });

  it('filters by the colour of a highlight or of a note, including a linked pair’s two colours', () => {
    const ids = (colors: MarginNote['color'][]) =>
      filterAnnotations(items, { query: '', colors }).map((i) => i.id);
    expect(ids(['sage'])).toEqual(['standalone']);
    expect(ids(['rose'])).toEqual(['linked']);
    expect(ids(['sky'])).toEqual(['linked']);
    expect(ids(['amber', 'sage'])).toEqual(['standalone', 'plain']);
  });

  it('keeps the item being edited visible', () => {
    expect(filterAnnotations(items, { query: 'zzz', colors: [] }, 'plain').map((i) => i.id)).toEqual([
      'plain',
    ]);
  });

  it('matchesItemFilters combines text and colour', () => {
    const [first] = items;
    expect(matchesItemFilters(first, searchTerms('thermo'), ['sage'])).toBe(first.id === 'standalone');
  });

  it('counts an item under every colour it carries', () => {
    expect(countAnnotationsByColor(items)).toEqual({ amber: 1, sage: 1, sky: 1, rose: 1, lavender: 0 });
  });
});
