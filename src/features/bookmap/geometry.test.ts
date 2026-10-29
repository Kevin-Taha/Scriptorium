import { describe, expect, it } from 'vitest';
import type { Bookmark, Highlight, MarginNote, OutlineItem } from '@/lib/types';
import { buildChapterSpans } from '../navigation/chapterProgressModel';
import {
  chapterLabel,
  describePage,
  fractionOf,
  GROUP_SPAN,
  keyboardStep,
  layoutMarks,
  locationAt,
  MAX_PULL,
  mapItems,
  type SnapTarget,
  sameMarks,
  snapAt,
  snapTargets,
  thumbBox,
} from './geometry';

const note = (page: number, y: number, extra: Partial<MarginNote> = {}): MarginNote => ({
  id: `n${page}:${y}`,
  docId: 'd',
  page,
  y,
  text: `Note on ${page}`,
  color: 'amber',
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});
const highlight = (page: number, y = 0.21): Highlight => ({
  id: `h${page}:${y}`,
  docId: 'd',
  page,
  rects: [{ x: 0.1, y: y - 0.01, w: 0.5, h: 0.02 }],
  text: `Passage on ${page}`,
  color: 'sky',
  createdAt: 0,
  updatedAt: 0,
});
const bookmark = (page: number): Bookmark => ({ id: `b${page}`, docId: 'd', page, label: '', createdAt: 0 });

describe('book map geometry', () => {
  it('maps locations linearly by page and back, clamped to the book', () => {
    expect(fractionOf({ page: 19, offset: 0.5 }, 36)).toBeCloseTo(18.5 / 36);
    expect(locationAt(18.5 / 36, 36)).toEqual({ page: 19, offset: expect.closeTo(0.5) });
    expect(fractionOf({ page: 99, offset: 3 }, 36)).toBe(1);
    expect(locationAt(1, 36)).toEqual({ page: 36, offset: 1 });
    expect(locationAt(-0.2, 36)).toEqual({ page: 1, offset: 0 });
  });

  it('labels chapters like a thumb index', () => {
    expect(
      ['Chapter 3 Energy', 'CHAPTER 12: Waves', 'Part iv The Rest', 'Appendix A Units', '4. Momentum'].map(
        chapterLabel,
      ),
    ).toEqual(['3', '12', 'IV', 'A', '4']);
    expect(chapterLabel('Preface')).toBe('');
  });

  it('steps the keyboard cursor by page, ten pages, chapter and to the ends', () => {
    const item = (title: string, page: number): OutlineItem => ({
      title,
      location: { page, offset: 0 },
      children: [],
    });
    const chapters = buildChapterSpans([item('One', 3), item('Two', 11), item('Three', 19)], 36);
    const step = (key: string, page: number, shift = false) => keyboardStep(key, shift, page, 36, chapters);
    expect([step('ArrowDown', 5), step('ArrowUp', 1), step('ArrowDown', 30, true)]).toEqual([6, 1, 36]);
    expect([step('PageDown', 5), step('PageDown', 19), step('PageUp', 14), step('PageUp', 3)]).toEqual([
      11, 36, 11, 1,
    ]);
    expect([step('Home', 20), step('End', 20), step('x', 20)]).toEqual([1, 36, null]);
  });

  it('places every annotation on the track, highlights first, merging overlaps', () => {
    const marks = layoutMarks([note(2, 0.5)], [highlight(3)], [bookmark(4)], 10, 100);
    expect(marks.map(({ kind, y, color }) => ({ kind, y, color }))).toEqual([
      { kind: 'highlight', y: 22, color: 'sky' },
      { kind: 'note', y: 15, color: 'amber' },
      { kind: 'bookmark', y: 30, color: undefined },
    ]);
    const crowded = layoutMarks(
      Array.from({ length: 1000 }, (_, i) => note(i + 1, 0.5)),
      [],
      [],
      1000,
      600,
    );
    expect(crowded.length).toBeLessThanOrEqual(201);
  });

  it('recognises an unchanged layout, e.g. while a note is being typed', () => {
    const before = layoutMarks([note(2, 0.5)], [highlight(3)], [], 10, 100);
    const typed = note(2, 0.5, { text: 'More words' });
    expect(sameMarks(before, layoutMarks([typed], [highlight(3)], [], 10, 100))).toBe(true);
    expect(sameMarks(before, layoutMarks([note(2, 0.9)], [highlight(3)], [], 10, 100))).toBe(false);
  });

  it('describes what is on a page', () => {
    const notes = [note(2, 0.1), note(2, 0.6)];
    expect(describePage(2, notes, [highlight(2)], [bookmark(2)])).toBe('2 notes, 1 highlight, bookmarked');
    expect(describePage(3, notes, [highlight(2)], [bookmark(2)])).toBe('');
  });

  it('sizes the viewport window and keeps it on the track', () => {
    expect(thumbBox(0.25, 0.5, 400, 12)).toEqual({ y: 100, height: 100 });
    expect(thumbBox(0.5, 0.501, 400, 12)).toEqual({ y: 194.2, height: 12 });
    expect(thumbBox(0.999, 1, 400, 12)).toEqual({ y: 388, height: 12 });
  });
});

/** The page a click at track px `y` lands on, snapped or not. */
const landing = (targets: SnapTarget[], y: number, pages: number, height: number) =>
  snapAt(targets, y)?.items[0].page ?? locationAt(y / height, pages).page;

const reachable = (targets: SnapTarget[], pages: number, height: number) => {
  const found = new Set<number>();
  for (let y = 0; y <= height; y++) found.add(landing(targets, y, pages, height));
  return found.size;
};

describe('snapping', () => {
  it('lists bookmarks, notes and unlinked highlights in reading order, a bookmark first on its page', () => {
    const linked = highlight(5, 0.4);
    const items = mapItems(
      [note(5, 0.4, { id: 'linked', highlightId: linked.id }), note(2, 0.7)],
      [linked, highlight(9, 0.1)],
      [bookmark(5), bookmark(1)],
    );
    expect(items.map((i) => `${i.kind}:${i.page}`)).toEqual([
      'bookmark:1',
      'note:2',
      'bookmark:5',
      'note:5',
      'highlight:9',
    ]);
  });

  it('catches the pointer near a sparse mark, lets go beyond its pull, and keeps every page reachable', () => {
    const targets = snapTargets(mapItems([note(12, 0.5), note(30, 0.2)], [], [bookmark(5)]), 36, 600);
    const noteY = (11.5 / 36) * 600;
    expect(targets.map((t) => t.pull)).toEqual([MAX_PULL, MAX_PULL, MAX_PULL]);
    expect(snapAt(targets, noteY - 5.5)?.items[0]).toMatchObject({ kind: 'note', page: 12 });
    expect(snapAt(targets, noteY + MAX_PULL + 0.5)).toBeNull();
    expect(reachable(targets, 36, 600)).toBe(36);
  });

  it('shrinks the pull between close marks and turns it off where they crowd', () => {
    // A mark every 12px: each pulls 3px, leaving half of every gap unclaimed.
    const spaced = snapTargets(
      mapItems(
        Array.from({ length: 50 }, (_, i) => note(i + 1, 0.5)),
        [],
        [],
      ),
      50,
      600,
    );
    expect(spaced.every((t) => Math.abs(t.pull - 3) < 1e-9)).toBe(true);
    expect(reachable(spaced, 50, 600)).toBe(50);
    const crowded = snapTargets(
      mapItems(
        Array.from({ length: 1000 }, (_, i) => note(i + 1, 0.5)),
        [],
        [],
      ),
      1000,
      830,
    );
    expect(crowded.every((t) => t.pull === 0)).toBe(true);
  });

  it('treats marks on neighbouring pages of a long book as one target that lands on the first', () => {
    const items = mapItems([note(41, 0.3), note(40, 0.6)], [highlight(42, 0.1)], [bookmark(40)]);
    const [target, ...rest] = snapTargets(items, 1000, 830);
    expect(rest).toHaveLength(0);
    expect(target.items.map((i) => `${i.kind}:${i.page}`)).toEqual([
      'bookmark:40',
      'note:40',
      'note:41',
      'highlight:42',
    ]);
    expect(target.bottom - target.top).toBeLessThanOrEqual(GROUP_SPAN);
    expect(landing([target], target.top - 5, 1000, 830)).toBe(40);
  });
});
