import { describe, expect, it } from 'vitest';
import type { OutlineItem } from '@/lib/types';
import { buildChapterSpans, chapterProgress, findCurrentChapter } from './chapterProgressModel';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0.2 },
  children,
});

describe('chapter spans', () => {
  it('runs each chapter to the next start, with front matter before the first', () => {
    const spans = buildChapterSpans([item('Second', 11), item('First', 3, [item('Section', 6)])], 36);
    expect(spans.map(({ title, startPage, endPage }) => [title, startPage, endPage])).toEqual([
      ['Front matter', 1, 3],
      ['First', 3, 11],
      ['Second', 11, 37],
    ]);
    expect(spans[1].location).toEqual({ page: 3, offset: 0.2 });
  });

  it('has no front matter when a chapter starts on the first page', () => {
    expect(buildChapterSpans([item('Intro', 1)], 3)).toEqual([
      { title: 'Intro', startPage: 1, endPage: 4, location: { page: 1, offset: 0.2 } },
    ]);
  });

  it('uses the entire book when there are no usable starts, and no spans without pages', () => {
    const book = [{ title: 'Book', startPage: 1, endPage: 37, location: { page: 1, offset: 0 } }];
    expect(buildChapterSpans([], 36)).toEqual(book);
    expect(buildChapterSpans([item('Missing', null)], 36)).toEqual(book);
    expect(buildChapterSpans([], 0)).toEqual([]);
  });

  it('calculates page-based progress, clamped outside the span, and finds the chapter of a page', () => {
    const spans = buildChapterSpans([item('First', 3), item('Second', 11)], 36);
    const chapter = findCurrentChapter(spans, 6);
    expect(chapter.title).toBe('First');
    expect(chapterProgress(chapter, 6)).toBe(3 / 8);
    expect(chapterProgress(chapter, 1)).toBe(0);
    expect(chapterProgress(chapter, 15)).toBe(1);
    expect(findCurrentChapter(spans, 11).title).toBe('Second');
    expect(findCurrentChapter(spans, 0).title).toBe('Front matter');
    expect(findCurrentChapter(spans, 100).title).toBe('Second');
  });
});
