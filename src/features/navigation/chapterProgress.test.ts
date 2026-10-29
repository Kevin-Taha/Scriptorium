import { describe, expect, it } from 'vitest';
import type { OutlineItem } from '@/lib/types';
import {
  buildChapterSpans,
  chapterProgress,
  findCurrentChapter,
  pagesLeft,
  stepSegment,
} from './chapterProgressModel';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0.2 },
  children,
});

describe('chapter spans', () => {
  it('sorts and deduplicates resolved top-level starts, preserving the first destination', () => {
    const spans = buildChapterSpans(
      [
        item('Second', 11),
        item('First', 3, [item('Section', 6)]),
        item('Duplicate', 11),
        item('Unresolved', null),
        item('Outside', 37),
        item('Invalid', 2.5),
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

  it('uses the entire book when there are no usable starts, and no spans without pages', () => {
    const book = [{ title: 'Book', startPage: 1, endPage: 37, location: { page: 1, offset: 0 } }];
    expect(buildChapterSpans([], 36)).toEqual(book);
    expect(buildChapterSpans([item('Missing', null)], 36)).toEqual(book);
    expect(buildChapterSpans([], 0)).toEqual([]);
    expect(buildChapterSpans([], Number.NaN)).toEqual([]);
  });

  it('does not insert front matter when a chapter starts on the first page', () => {
    expect(buildChapterSpans([item('Intro', 1)], 3)).toEqual([
      { title: 'Intro', startPage: 1, endPage: 4, location: { page: 1, offset: 0.2 } },
    ]);
  });

  it('draws the chapters of a book whose outline wraps them in a root entry', () => {
    const spans = buildChapterSpans([item('Mechanics', 1, [item('Kinematics', 3), item('Forces', 11)])], 36);
    expect(spans.map(({ title, startPage, endPage }) => [title, startPage, endPage])).toEqual([
      ['Front matter', 1, 3],
      ['Kinematics', 3, 11],
      ['Forces', 11, 37],
    ]);
  });

  it('draws the chapters inside parts that have no destination', () => {
    const spans = buildChapterSpans(
      [item('Part I', null, [item('Ch 1', 3), item('Ch 2', 9)]), item('Part II', null, [item('Ch 3', 20)])],
      36,
    );
    expect(spans.map(({ title, startPage, endPage }) => [title, startPage, endPage])).toEqual([
      ['Front matter', 1, 3],
      ['Ch 1', 3, 9],
      ['Ch 2', 9, 20],
      ['Ch 3', 20, 37],
    ]);
  });

  it('calculates page-based progress and remaining pages, clamped outside the span', () => {
    const spans = buildChapterSpans([item('First', 3), item('Second', 11)], 36);
    const chapter = findCurrentChapter(spans, 6)!;
    expect(chapter.title).toBe('First');
    expect(chapterProgress(chapter, 6)).toBe(3 / 8);
    expect(pagesLeft(chapter, 6)).toBe(4);
    expect(pagesLeft(chapter, 9)).toBe(1);
    expect(pagesLeft(chapter, 10)).toBe(0);
    expect(chapterProgress(chapter, 1)).toBe(0);
    expect(chapterProgress(chapter, 15)).toBe(1);
    expect(pagesLeft(chapter, 15)).toBe(0);
    expect(findCurrentChapter(spans, 11)?.title).toBe('Second');
    expect(findCurrentChapter(spans, 0)?.title).toBe('Front matter');
    expect(findCurrentChapter(spans, 100)?.title).toBe('Second');
    expect(findCurrentChapter([], 1)).toBeNull();
  });
});

describe('strip keyboard', () => {
  it('steps between segments without wrapping, and ignores other keys', () => {
    expect(stepSegment('ArrowRight', 1, 6)).toBe(2);
    expect(stepSegment('ArrowRight', 5, 6)).toBe(5);
    expect(stepSegment('ArrowLeft', 1, 6)).toBe(0);
    expect(stepSegment('ArrowLeft', 0, 6)).toBe(0);
    expect(stepSegment('Home', 3, 6)).toBe(0);
    expect(stepSegment('End', 3, 6)).toBe(5);
    expect(stepSegment('Enter', 3, 6)).toBeNull();
    expect(stepSegment('ArrowDown', 3, 6)).toBeNull();
  });
});
