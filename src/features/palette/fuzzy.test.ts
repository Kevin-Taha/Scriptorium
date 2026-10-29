import { describe, expect, it } from 'vitest';
import { matchPrepared, normalizeQuery, prepareFuzzyText } from './fuzzy';
import { candidate, pageQuery, rankCandidates } from './results';

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

describe('pageQuery', () => {
  it('supports labels, PDF page numbers and page prefixes without stripping ordinary words', () => {
    for (const input of ['37', 'p 37', 'p. 37', 'page 37', 'PAGE 37']) {
      expect(pageQuery(null, input, 40)).toBe(37);
    }
    expect(pageQuery(['i', 'ii', '1'], 'p. ii', 3)).toBe(2);
    expect(pageQuery(['i', 'ii', '1'], '#3', 3)).toBe(3);
    expect(pageQuery(null, 'pageant', 40)).toBeNull();
    expect(pageQuery(null, 'page 41', 40)).toBeNull();
  });
});

describe('rankCandidates', () => {
  it('ranks and caps each group, and keeps only suggestions for an empty query', () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      candidate({
        id: String(index),
        group: 'Contents',
        title: index === 11 ? 'Force' : `Other force ${index}`,
        icon: 'contents',
        suggested: index < 3 || index === 11,
        current: index === 11,
        run: () => {},
      }),
    );
    const matched = rankCandidates(items, 'force').get('Contents')!;
    expect(matched).toHaveLength(8);
    expect(matched[0].item.title).toBe('Force');
    const suggested = rankCandidates(items, '').get('Contents')!;
    expect(suggested).toHaveLength(4);
    expect(suggested[0].item.current).toBe(true);
    expect(rankCandidates(items, 'unlikely').size).toBe(0);
  });
});
