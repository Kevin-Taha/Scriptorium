import { describe, expect, it } from 'vitest';
import { matchPrepared, normalizeQuery, prepareFuzzyText } from './fuzzy';

const fuzzyMatch = (query: string, text: string) =>
  matchPrepared(normalizeQuery(query), prepareFuzzyText(text));

describe('fuzzyMatch', () => {
  it('matches subsequences without case or accent sensitivity', () => {
    expect(fuzzyMatch('cafe', 'Café notes')?.indices).toEqual([0, 1, 2, 3]);
    expect(fuzzyMatch('mmt', 'Momentum')?.indices).toEqual([0, 2, 5]);
    expect(fuzzyMatch('xyz', 'Momentum')).toBeNull();
  });

  it('keeps indices into the original UTF-16 string', () => {
    expect(fuzzyMatch('cafe', '📚 Cafe\u0301')?.indices).toEqual([3, 4, 5, 6]);
  });

  it('favours prefixes, word beginnings and contiguous runs', () => {
    expect(fuzzyMatch('dark', 'Dark theme')!.score).toBeGreaterThan(
      fuzzyMatch('dark', 'Make it dark')!.score,
    );
    expect(fuzzyMatch('nt', 'New text')!.score).toBeGreaterThan(fuzzyMatch('nt', 'ant')!.score);
    expect(fuzzyMatch('mom', 'Momentum')!.score).toBeGreaterThan(fuzzyMatch('mom', 'M o m')!.score);
  });

  it('handles empty queries and mismatches', () => {
    expect(fuzzyMatch(' ', 'Anything')).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch('longer', 'long')).toBeNull();
  });
});
