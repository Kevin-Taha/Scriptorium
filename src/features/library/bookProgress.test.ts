import { describe, expect, it } from 'vitest';
import type { ContentsEntry, OutlineItem } from '@/lib/types';
import { bookProgress, contentsFromOutline, MAX_CONTENTS, MAX_SEGMENTS, sameContents } from './bookProgress';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0 },
  children,
});

const textbook: ContentsEntry[] = [
  { title: 'Chapter 1: Kinematics', page: 3, depth: 0 },
  { title: '1.1 Position', page: 3, depth: 1 },
  { title: '1.2 Velocity', page: 6, depth: 1 },
  { title: 'Chapter 2: Newton’s Laws', page: 11, depth: 0 },
  { title: '2.1 Inertia', page: 11, depth: 1 },
  { title: '2.2 The Second Law', page: 14, depth: 1 },
  { title: 'Appendix A', page: 35, depth: 0 },
];

describe('contentsFromOutline', () => {
  it('keeps resolved chapters and their sections in page order', () => {
    const outline = [
      item('Two', 11, [item('2.1', 11), item('2.2', null), item('2.3', 17, [item('2.3.1', 18)])]),
      item('One', 3, [item('1.1', 3)]),
    ];
    expect(contentsFromOutline(outline)).toEqual([
      { title: 'One', page: 3, depth: 0 },
      { title: '1.1', page: 3, depth: 1 },
      { title: 'Two', page: 11, depth: 0 },
      { title: '2.1', page: 11, depth: 1 },
      { title: '2.3', page: 17, depth: 1 },
    ]);
  });

  it('treats a lone top-level entry as the book title', () => {
    const outline = [
      item('Mechanics', 1, [item('Kinematics', 3, [item('Velocity', 6)]), item('Forces', 11)]),
    ];
    expect(contentsFromOutline(outline)).toEqual([
      { title: 'Kinematics', page: 3, depth: 0 },
      { title: 'Velocity', page: 6, depth: 1 },
      { title: 'Forces', page: 11, depth: 0 },
    ]);
  });

  it('lets the children of a heading without a destination stand in as chapters', () => {
    const outline = [
      item('Part I', null, [item('Ch 1', 3), item('Ch 2', 9)]),
      item('Part II', 20, [item('Ch 3', 21)]),
    ];
    expect(contentsFromOutline(outline).map((e) => [e.title, e.depth])).toEqual([
      ['Ch 1', 0],
      ['Ch 2', 0],
      ['Part II', 0],
      ['Ch 3', 1],
    ]);
  });

  it('keeps the sections of chapters that stand in for a heading without a destination', () => {
    const outline = [
      item('Part I', null, [item('Ch 1', 3, [item('1.1', 4)]), item('Ch 2', 9)]),
      item('Index', 30),
    ];
    expect(contentsFromOutline(outline).map((e) => [e.title, e.depth])).toEqual([
      ['Ch 1', 0],
      ['1.1', 1],
      ['Ch 2', 0],
      ['Index', 0],
    ]);
  });

  it('keeps one chapter per page and skips untitled entries', () => {
    const outline = [item('Part I', 5), item('Chapter 1', 5), item('  ', 8), item(' Chapter 2 ', 9)];
    expect(contentsFromOutline(outline).map((e) => e.title)).toEqual(['Part I', 'Chapter 2']);
  });

  it('is empty without an outline', () => {
    expect(contentsFromOutline([])).toEqual([]);
  });

  it('keeps only the chapter level of an enormous outline, capped', () => {
    const outline = Array.from({ length: MAX_CONTENTS + 20 }, (_, i) =>
      item(`C${i}`, i + 1, [item(`S${i}`, i + 1)]),
    );
    const contents = contentsFromOutline(outline);
    expect(contents).toHaveLength(MAX_CONTENTS);
    expect(contents.every((e) => e.depth === 0)).toBe(true);
  });
});

describe('sameContents', () => {
  it('compares what is saved with what the outline gives', () => {
    expect(sameContents(textbook, [...textbook])).toBe(true);
    expect(sameContents(textbook, textbook.slice(1))).toBe(false);
    expect(
      sameContents(
        textbook,
        textbook.map((e, i) => (i === 2 ? { ...e, title: 'Speed' } : e)),
      ),
    ).toBe(false);
  });

  it('counts a book with nothing saved as having an empty outline', () => {
    expect(sameContents(undefined, [])).toBe(true);
    expect(sameContents(undefined, textbook)).toBe(false);
  });
});

describe('bookProgress', () => {
  const doc = { pageCount: 36, contents: textbook };

  it('names the chapter and section, and counts chapters', () => {
    const progress = bookProgress(doc, { page: 14, offset: 0 });
    expect(progress.chapter).toEqual({ title: 'Chapter 2: Newton’s Laws', number: 2, count: 3 });
    expect(progress.section).toBe('2.2 The Second Law');
    expect(progress.page).toBe(14);
    expect(progress.percent).toBe(36);
  });

  it('shows no section until one has started in the chapter', () => {
    expect(bookProgress(doc, { page: 35, offset: 0 }).section).toBeNull();
    expect(bookProgress(doc, { page: 3, offset: 0 }).section).toBe('1.1 Position');
    expect(bookProgress(doc, { page: 11, offset: 0.2 }).section).toBe('2.1 Inertia');
  });

  it('does not carry the last section of one chapter into the next', () => {
    const next = [...textbook.slice(0, 6), { title: 'Chapter 3', page: 14, depth: 0 as const }];
    const progress = bookProgress({ pageCount: 36, contents: next }, { page: 14, offset: 0 });
    expect(progress.chapter?.title).toBe('Chapter 3');
    expect(progress.section).toBeNull();
  });

  it('draws one segment per chapter, with the front matter first and the current one marked', () => {
    const { segments, current } = bookProgress(doc, { page: 14, offset: 0 });
    expect(segments.map((s) => [s.start, s.end])).toEqual([
      [1, 2],
      [3, 10],
      [11, 34],
      [35, 36],
    ]);
    expect(current).toBe(2);
    expect(segments.map((s) => s.fill)).toEqual([1, 1, 3 / 24, 0]);
  });

  it('fills partway through a page using the offset', () => {
    const { segments } = bookProgress(doc, { page: 3, offset: 0.5 });
    expect(segments[1].fill).toBeCloseTo(0.5 / 8);
  });

  it('calls the pages before the first chapter front matter', () => {
    const progress = bookProgress(doc, { page: 2, offset: 0.5 });
    expect(progress.chapter).toEqual({ title: 'Front matter', number: null, count: 3 });
    expect(progress.section).toBeNull();
    expect(progress.current).toBe(0);
  });

  it('has no front matter segment when the first chapter starts on page 1', () => {
    const progress = bookProgress(
      { pageCount: 10, contents: [{ title: 'One', page: 1, depth: 0 }] },
      { page: 4, offset: 0 },
    );
    expect(progress.segments).toEqual([{ start: 1, end: 10, fill: 0.3 }]);
    expect(progress.chapter).toEqual({ title: 'One', number: 1, count: 1 });
  });

  it('falls back to one plain bar and no chapter without contents', () => {
    for (const contents of [undefined, []]) {
      const progress = bookProgress({ pageCount: 36, contents }, { page: 14, offset: 0 });
      expect(progress.chapter).toBeNull();
      expect(progress.section).toBeNull();
      expect(progress.segments).toEqual([{ start: 1, end: 36, fill: 13 / 36 }]);
      expect(progress.current).toBe(0);
    }
  });

  it('keeps the bar whole but still names the chapter when there are too many to draw', () => {
    const many = Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => ({
      title: `C${i + 1}`,
      page: i + 1,
      depth: 0 as const,
    }));
    const progress = bookProgress({ pageCount: 100, contents: many }, { page: 10, offset: 0 });
    expect(progress.segments).toHaveLength(1);
    expect(progress.chapter).toEqual({ title: 'C10', number: 10, count: MAX_SEGMENTS + 1 });
  });

  it('starts a book with no saved position at page 1', () => {
    const progress = bookProgress(doc, undefined);
    expect(progress.page).toBe(1);
    expect(progress.percent).toBe(0);
    expect(progress.chapter?.title).toBe('Front matter');
  });

  it('keeps a stale position inside the book', () => {
    expect(bookProgress(doc, { page: 99, offset: 0 }).page).toBe(36);
    expect(bookProgress(doc, { page: 0, offset: 0 }).page).toBe(1);
  });

  it('ignores contents while the page count is unknown', () => {
    const progress = bookProgress({ pageCount: 0, contents: textbook }, { page: 14, offset: 0 });
    expect(progress.page).toBe(14);
    expect(progress.percent).toBe(0);
    expect(progress.chapter).toBeNull();
    expect(progress.segments).toEqual([{ start: 1, end: 1, fill: 0 }]);
  });
});
