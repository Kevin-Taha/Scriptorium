import { describe, expect, it } from 'vitest';
import type { Bookmark, Highlight, MarginNote, OutlineItem } from '@/lib/types';
import {
  chapterIndexAt,
  chapterLabel,
  describeSummary,
  fractionOf,
  keyboardStep,
  layoutMarks,
  locationAt,
  markInputs,
  pageAt,
  pageRuns,
  placeCard,
  railChapters,
  summarizePages,
  thumbBox,
} from './geometry';
import { addToTrail, decodeRuns, encodeRuns } from './readTrail';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0.1 },
  children,
});

const OUTLINE = [
  item('Chapter 1 Kinematics', 3, [item('1.1 Position', 4)]),
  item("Chapter 2 Newton's Laws", 11),
  item('Chapter 3 Energy and Work', 19),
  item('Chapter 4 Momentum', 27),
  item('Appendix A Units', 35),
];

describe('fraction mapping', () => {
  it('maps locations linearly by page and back again', () => {
    expect(fractionOf({ page: 1, offset: 0 }, 36)).toBe(0);
    expect(fractionOf({ page: 36, offset: 1 }, 36)).toBe(1);
    expect(fractionOf({ page: 19, offset: 0.5 }, 36)).toBeCloseTo(18.5 / 36);
    const there = locationAt(18.5 / 36, 36);
    expect(there.page).toBe(19);
    expect(there.offset).toBeCloseTo(0.5);
  });

  it('clamps out-of-range input instead of producing impossible pages', () => {
    expect(fractionOf({ page: 99, offset: 3 }, 36)).toBe(1);
    expect(fractionOf({ page: 0, offset: -1 }, 36)).toBe(0);
    expect(fractionOf({ page: 3, offset: Number.NaN }, 36)).toBeCloseTo(2 / 36);
    expect(locationAt(1, 36)).toEqual({ page: 36, offset: 1 });
    expect(locationAt(-0.2, 36)).toEqual({ page: 1, offset: 0 });
    expect(pageAt(0.999, 1000)).toBe(1000);
    expect(fractionOf({ page: 1, offset: 0 }, 0)).toBe(0);
  });
});

describe('chapters', () => {
  it('labels chapters like a thumb index', () => {
    expect(chapterLabel('Chapter 3 Energy and Work')).toBe('3');
    expect(chapterLabel('CHAPTER 12: Waves')).toBe('12');
    expect(chapterLabel('Part iv The Rest')).toBe('IV');
    expect(chapterLabel('Appendix A Units')).toBe('A');
    expect(chapterLabel('4. Momentum')).toBe('4');
    expect(chapterLabel('Preface')).toBe('');
    expect(chapterLabel('1984 revisited')).toBe('1984');
  });

  it('builds sorted, de-duplicated bands from the top level', () => {
    const chapters = railChapters([...OUTLINE, item('Duplicate', 11), item('Unresolved', null)], 36);
    expect(chapters.map((c) => [c.label, c.startPage, c.endPage])).toEqual([
      ['1', 3, 11],
      ['2', 11, 19],
      ['3', 19, 27],
      ['4', 27, 35],
      ['A', 35, 37],
    ]);
  });

  it('looks inside a single root entry that only wraps the chapters', () => {
    const chapters = railChapters([item('Principles of Mechanics', 1, OUTLINE)], 36);
    expect(chapters).toHaveLength(5);
    expect(railChapters([], 36)).toEqual([]);
  });

  it('finds the chapter containing a page', () => {
    const chapters = railChapters(OUTLINE, 36);
    expect(chapterIndexAt(chapters, 1)).toBe(-1);
    expect(chapterIndexAt(chapters, 3)).toBe(0);
    expect(chapterIndexAt(chapters, 26)).toBe(2);
    expect(chapterIndexAt(chapters, 36)).toBe(4);
  });
});

describe('keyboard steps', () => {
  const chapters = railChapters(OUTLINE, 36);

  it('moves by page, ten pages, chapter and to the ends', () => {
    expect(keyboardStep('ArrowDown', false, 5, 36, chapters)).toBe(6);
    expect(keyboardStep('ArrowUp', false, 1, 36, chapters)).toBe(1);
    expect(keyboardStep('ArrowDown', true, 30, 36, chapters)).toBe(36);
    expect(keyboardStep('PageDown', false, 5, 36, chapters)).toBe(11);
    expect(keyboardStep('PageDown', false, 35, 36, chapters)).toBe(36);
    expect(keyboardStep('PageUp', false, 14, 36, chapters)).toBe(11);
    expect(keyboardStep('PageUp', false, 11, 36, chapters)).toBe(3);
    expect(keyboardStep('PageUp', false, 3, 36, chapters)).toBe(1);
    expect(keyboardStep('Home', false, 20, 36, chapters)).toBe(1);
    expect(keyboardStep('End', false, 20, 36, chapters)).toBe(36);
    expect(keyboardStep('x', false, 20, 36, chapters)).toBeNull();
  });
});

describe('marks', () => {
  const note = (page: number, y: number): MarginNote => ({
    id: `n${page}:${y}`,
    docId: 'd',
    page,
    y,
    text: '',
    color: 'amber',
    createdAt: 0,
    updatedAt: 0,
  });
  const highlight = (page: number): Highlight => ({
    id: `h${page}`,
    docId: 'd',
    page,
    rects: [
      { x: 0.1, y: 0.4, w: 0.5, h: 0.02 },
      { x: 0.1, y: 0.2, w: 0.5, h: 0.02 },
    ],
    text: '',
    color: 'sky',
    createdAt: 0,
    updatedAt: 0,
  });
  const bookmark = (page: number): Bookmark => ({
    id: `b${page}`,
    docId: 'd',
    page,
    label: '',
    createdAt: 0,
  });

  it('places each annotation where it sits in the book', () => {
    const inputs = markInputs([note(2, 0.5)], [highlight(3)], [bookmark(4)], 10);
    expect(inputs).toEqual([
      { kind: 'bookmark', fraction: 0.3 },
      { kind: 'highlight', fraction: expect.closeTo(0.221, 3), color: 'sky' },
      { kind: 'note', fraction: 0.15, color: 'amber' },
    ]);
  });

  it('merges same-kind marks that would overlap and keeps a bounded number of shapes', () => {
    const notes = Array.from({ length: 1000 }, (_, i) => note(i + 1, 0.5));
    const marks = layoutMarks(markInputs(notes, [], [], 1000), 600);
    expect(marks.length).toBeLessThanOrEqual(201);
    expect(marks.reduce((sum, m) => sum + m.count, 0)).toBe(1000);
    const mixed = layoutMarks(markInputs([note(5, 0)], [], [bookmark(5)], 10), 100);
    expect(mixed.map((m) => [m.kind, m.y])).toEqual([
      ['note', 40],
      ['bookmark', 40],
    ]);
    expect(layoutMarks(markInputs(notes, [], [], 1000), 0)).toEqual([]);
  });

  it('summarises a page for the preview card', () => {
    const pages = summarizePages([note(2, 0.1), note(2, 0.6)], [highlight(2)], [bookmark(2), bookmark(9)]);
    expect(describeSummary(pages.get(2))).toBe('2 notes · 1 highlight · bookmarked');
    expect(describeSummary(pages.get(9))).toBe('bookmarked');
    expect(describeSummary(pages.get(3))).toBe('');
  });
});

describe('thumb and card placement', () => {
  it('sizes the viewport window and keeps it on the track', () => {
    expect(thumbBox(0.25, 0.5, 400, 12)).toEqual({ y: 100, height: 100 });
    expect(thumbBox(0.5, 0.501, 400, 12)).toEqual({ y: 194.2, height: 12 });
    expect(thumbBox(0.999, 1, 400, 12)).toEqual({ y: 388, height: 12 });
    expect(thumbBox(0, 2, 400, 12)).toEqual({ y: 0, height: 400 });
    expect(thumbBox(0, 0.5, 0, 12)).toEqual({ y: 0, height: 0 });
  });

  it('centres the card on the pointer but keeps it inside the reader', () => {
    expect(placeCard(300, 200, 800)).toBe(200);
    expect(placeCard(20, 200, 800)).toBe(8);
    expect(placeCard(790, 200, 800)).toBe(592);
    expect(placeCard(100, 900, 800)).toBe(8);
  });
});

describe('read trail', () => {
  it('stores pages as compact runs', () => {
    expect(pageRuns([1, 2, 3, 7, 8, 10])).toEqual([
      [1, 3],
      [7, 8],
      [10, 10],
    ]);
    expect(encodeRuns([8, 3, 1, 2, 7, 3, 0, -2])).toBe('1-3,7-8');
    expect(decodeRuns('1-3,7-8,x,9-4,12')).toEqual([
      [1, 3],
      [7, 8],
      [12, 12],
    ]);
  });

  it('adds pages and reports no change with the same string', () => {
    expect(addToTrail(undefined, [4, 5])).toBe('4-5');
    expect(addToTrail('4-5', [6])).toBe('4-6');
    const same = '4-6';
    expect(addToTrail(same, [5])).toBe(same);
  });
});
