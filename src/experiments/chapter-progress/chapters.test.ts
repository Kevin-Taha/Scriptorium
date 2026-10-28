import { describe, expect, it } from 'vitest';
import type { OutlineItem } from '@/lib/types';
import {
  buildChapterSpans,
  chapterProgress,
  findCurrentChapter,
  formatTimeLeft,
  minutesLeft,
  pagesLeft,
} from './chapters';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0.2 },
  children,
});

describe('chapter spans', () => {
  it('uses only resolved top-level starts, sorted and deduplicated, including front matter', () => {
    const spans = buildChapterSpans(
      [
        item('Second', 11),
        item('First', 3, [item('Section', 6)]),
        item('Duplicate', 11),
        item('Unresolved', null),
        item('Outside', 37),
      ],
      36,
    );
    expect(spans.map(({ title, startPage, endPage }) => [title, startPage, endPage])).toEqual([
      ['Front matter', 1, 3],
      ['First', 3, 11],
      ['Second', 11, 37],
    ]);
    expect(spans[1].location).toEqual({ page: 3, offset: 0.2 });
  });

  it('uses one whole-book segment for a missing outline and none for an empty document', () => {
    expect(buildChapterSpans([], 36)).toEqual([
      { title: 'Book', startPage: 1, endPage: 37, location: { page: 1, offset: 0 } },
    ]);
    expect(buildChapterSpans([], 0)).toEqual([]);
  });

  it('calculates proportional progress and the fractional time to the next start', () => {
    const spans = buildChapterSpans([item('First', 3), item('Second', 11)], 36);
    const current = findCurrentChapter(spans, { page: 6, offset: 0.5 })!;
    expect(current.title).toBe('First');
    expect(chapterProgress(current, { page: 6, offset: 0.5 })).toBeCloseTo(3.5 / 8);
    expect(pagesLeft(current, { page: 6, offset: 0.5 })).toBe(4.5);
    expect(minutesLeft(current, { page: 6, offset: 0.5 }, 90)).toBe(6.75);
    expect(chapterProgress(current, { page: 1, offset: 0 })).toBe(0);
    expect(chapterProgress(current, { page: 15, offset: 0 })).toBe(1);
    expect(findCurrentChapter(spans, { page: 11, offset: 0 })?.title).toBe('Second');
    expect(findCurrentChapter([], { page: 1, offset: 0 })).toBeNull();
  });

  it('rounds short and long estimates readably', () => {
    expect(formatTimeLeft(0.3)).toBe('< 1 min');
    expect(formatTimeLeft(6.75)).toBe('≈ 7 min');
    expect(formatTimeLeft(70)).toBe('≈ 1 h 10 min');
    expect(formatTimeLeft(120)).toBe('≈ 2 h');
  });
});
