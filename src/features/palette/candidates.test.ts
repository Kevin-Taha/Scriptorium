import { afterEach, describe, expect, it } from 'vitest';
import { useReaderStore } from '@/features/reader/readerStore';
import { createMatcher, findMatches } from '@/features/search/matcher';
import type { PageResult } from '@/features/search/searchStore';
import { makePage } from '@/features/search/testPages';
import type { OutlineItem } from '@/lib/types';
import { buildCandidates, candidate, pageQuery, rankCandidates, textRows } from './candidates';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0 },
  children,
});

function contentsAt(outline: OutlineItem[], page: number) {
  useReaderStore.setState({ outline, location: { page, offset: 0 }, pageLabels: null });
  return buildCandidates()
    .filter((entry) => entry.group === 'Contents')
    .map((entry) => ({ title: entry.title, suggested: !!entry.suggested, current: !!entry.current }));
}

afterEach(() => useReaderStore.setState({ outline: [], location: { page: 1, offset: 0 } }));

describe('action hints', () => {
  it('come from the shortcut registry', () => {
    const hints = Object.fromEntries(buildCandidates().map((entry) => [entry.id, entry.hint]));
    expect(hints).toMatchObject({
      bookmark: 'B',
      review: 'Shift+R',
      'zoom-out': '−',
      fit: '0',
      shortcuts: '?',
    });
    expect(hints.map).toBeUndefined();
  });
});

describe('contents candidates', () => {
  it('suggests chapters and marks the current one, looking through a root entry', () => {
    const outline = [
      item('Mechanics', 1, [item('Kinematics', 3, [item('Velocity', 6)]), item('Forces', 11)]),
    ];
    expect(contentsAt(outline, 7)).toEqual([
      { title: 'Mechanics', suggested: false, current: false },
      { title: 'Kinematics', suggested: true, current: true },
      { title: 'Velocity', suggested: false, current: false },
      { title: 'Forces', suggested: true, current: false },
    ]);
  });

  it('treats the chapters of destination-less parts as the chapter level', () => {
    const outline = [item('Part I', null, [item('Ch 1', 3), item('Ch 2', 9)]), item('Part II', null)];
    expect(contentsAt(outline, 12)).toEqual([
      { title: 'Ch 1', suggested: true, current: false },
      { title: 'Ch 2', suggested: true, current: true },
    ]);
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
    const [matched] = rankCandidates(items, 'force');
    expect(matched.rows).toHaveLength(8);
    expect(matched.rows[0].item.title).toBe('Force');
    const [suggested] = rankCandidates(items, '');
    expect(suggested.rows.map((row) => row.item.id)).toEqual(['11', '0', '1', '2']);
    expect(rankCandidates(items, 'unlikely')).toEqual([]);
  });
});

describe('textRows', () => {
  const matcher = createMatcher('force')!;
  const results: PageResult[] = [1, 2].map((page) => {
    const text = makePage(page, ...Array.from({ length: 30 }, () => 'a force here'));
    return { page, text, matches: findMatches(text, matcher) };
  });
  const book = { labels: null, outline: [item('Dynamics', 2)], count: 2 };

  it('lists the first matches as snippets with the match marked', () => {
    const rows = textRows({ results, hits: 60, active: null }, book);
    expect(rows).toHaveLength(50);
    const [first] = rows;
    const marks = first.titleMarks!;
    expect(first.item.title.slice(marks[0], marks.at(-1)! + 1)).toBe('force');
    expect(first.item.detail).toBe('p. 1');
    expect(rows[30].item.detail).toBe('p. 2 · Dynamics');
    expect(rows.some((row) => row.current)).toBe(false);
  });

  it('keeps a chosen match far down the list in view', () => {
    const rows = textRows({ results, hits: 60, active: { page: 2, index: 25 } }, book);
    expect(rows).toHaveLength(50);
    expect(rows[0].item.id).toBe('text-1-10');
    expect(rows.findIndex((row) => row.current)).toBe(45);
  });
});
