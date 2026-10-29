import { describe, expect, it } from 'vitest';
import type { Bookmark, Highlight, MarginNote } from '@/lib/types';
import { pageAt } from './geometry';
import { GROUP_SPAN, MAX_PULL, mapItems, type SnapTarget, snapAt, snapTargets } from './snap';

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
const highlight = (page: number, y: number): Highlight => ({
  id: `h${page}:${y}`,
  docId: 'd',
  page,
  rects: [{ x: 0.1, y: y - 0.01, w: 0.5, h: 0.02 }],
  text: `Passage on ${page}`,
  color: 'sky',
  createdAt: 0,
  updatedAt: 0,
});
const bookmark = (page: number): Bookmark => ({
  id: `b${page}`,
  docId: 'd',
  page,
  label: `Page ${page}`,
  createdAt: 0,
});

/** Track px of an annotation at `page` + `y` on a `height` px track. */
const yOf = (page: number, y: number, pageCount: number, height: number) =>
  ((page - 1 + y) / pageCount) * height;

/** The page a click at track px `y` would land on, snapped or not. */
function landing(targets: SnapTarget[], y: number, pageCount: number, height: number): number {
  return snapAt(targets, y)?.items[0].page ?? pageAt(y / height, pageCount);
}

/** Every page some whole-pixel pointer position leads to. */
function reachablePages(targets: SnapTarget[], pageCount: number, height: number): Set<number> {
  const pages = new Set<number>();
  for (let y = 0; y <= height; y++) pages.add(landing(targets, y, pageCount, height));
  return pages;
}

describe('map items', () => {
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
});

describe('snapping in a sparse book', () => {
  const PAGES = 36;
  const HEIGHT = 600;
  const items = mapItems([note(12, 0.5), note(30, 0.2)], [highlight(20, 0.6)], [bookmark(5)]);
  const targets = snapTargets(items, PAGES, HEIGHT);

  it('gives every isolated mark the full pull', () => {
    expect(targets.map((t) => t.pull)).toEqual([MAX_PULL, MAX_PULL, MAX_PULL, MAX_PULL]);
  });

  it('catches the pointer near a mark and lets go beyond its pull', () => {
    const noteY = yOf(12, 0.5, PAGES, HEIGHT);
    expect(snapAt(targets, noteY)?.items[0]).toMatchObject({ kind: 'note', page: 12 });
    expect(snapAt(targets, noteY - 5.5)?.items[0]).toMatchObject({ kind: 'note', page: 12 });
    expect(snapAt(targets, noteY + MAX_PULL)?.items[0]).toMatchObject({ kind: 'note', page: 12 });
    expect(snapAt(targets, noteY + MAX_PULL + 0.5)).toBeNull();
    expect(snapAt(targets, yOf(5, 0, PAGES, HEIGHT) + 3)?.items[0].kind).toBe('bookmark');
    expect(snapAt(targets, 0)).toBeNull();
    expect(snapAt(targets, HEIGHT)).toBeNull();
  });

  it('keeps every page reachable', () => {
    expect(reachablePages(targets, PAGES, HEIGHT).size).toBe(PAGES);
  });
});

describe('snapping in a crowded book', () => {
  it('turns off where marks are closer than the pointer can tell apart', () => {
    const notes = [0.15, 0.45, 0.8].flatMap((y) => Array.from({ length: 36 }, (_, i) => note(i + 1, y)));
    const targets = snapTargets(mapItems(notes, [], []), 36, 600);
    expect(targets.every((t) => t.pull === 0)).toBe(true);
    expect(reachablePages(targets, 36, 600).size).toBe(36);
  });

  it('shrinks the pull so marks never claim more than half of the gap between them', () => {
    // A mark every 12px: each pulls 3px, leaving 6px of every gap unclaimed.
    const notes = Array.from({ length: 50 }, (_, i) => note(i + 1, 0.5));
    const targets = snapTargets(mapItems(notes, [], []), 50, 600);
    expect(targets.every((t) => Math.abs(t.pull - 3) < 1e-9)).toBe(true);
    expect(snapAt(targets, yOf(10, 0.5, 50, 600) + 2.5)?.items[0].page).toBe(10);
    expect(snapAt(targets, yOf(10, 0.5, 50, 600) + 6)).toBeNull();
    expect(reachablePages(targets, 50, 600).size).toBe(50);
  });
});

describe('snapping in a 1,000-page book', () => {
  const PAGES = 1000;
  const HEIGHT = 830;
  const unsnapped = reachablePages([], PAGES, HEIGHT);

  it('snaps to a bookmark that the bare map can only hit to within a page or two', () => {
    const targets = snapTargets(mapItems([], [], [bookmark(512)]), PAGES, HEIGHT);
    const y = yOf(512, 0, PAGES, HEIGHT);
    for (const offset of [-5, -2, 0, 2, 5]) expect(landing(targets, y + offset, PAGES, HEIGHT)).toBe(512);
    expect(pageAt((y - 2) / HEIGHT, PAGES)).not.toBe(512);
  });

  it('treats marks on neighbouring pages as one target and lands on the first', () => {
    const items = mapItems([note(41, 0.3), note(40, 0.6)], [highlight(42, 0.1)], [bookmark(40)]);
    const targets = snapTargets(items, PAGES, HEIGHT);
    expect(targets).toHaveLength(1);
    expect(targets[0].items.map((i) => `${i.kind}:${i.page}`)).toEqual([
      'bookmark:40',
      'note:40',
      'note:41',
      'highlight:42',
    ]);
    expect(targets[0].bottom - targets[0].top).toBeLessThanOrEqual(GROUP_SPAN);
    expect(targets[0].pull).toBe(MAX_PULL);
  });

  it('leaves pages away from sparse marks exactly as reachable as without snapping', () => {
    const items = mapItems(
      [40, 260, 480, 700, 930].map((page) => note(page, 0.5)),
      [highlight(160, 0.3)],
      [100, 512, 800].map(bookmark),
    );
    const targets = snapTargets(items, PAGES, HEIGHT);
    expect(targets.every((t) => t.pull === MAX_PULL)).toBe(true);
    const near = (y: number) =>
      targets.some((t) => y >= t.top - MAX_PULL - 1 && y <= t.bottom + MAX_PULL + 1);
    for (let y = 0; y <= HEIGHT; y++) {
      if (!near(y)) expect(landing(targets, y, PAGES, HEIGHT)).toBe(pageAt(y / HEIGHT, PAGES));
    }
  });

  it('does not snap at all when every page carries a note', () => {
    const notes = Array.from({ length: PAGES }, (_, i) => note(i + 1, 0.5));
    const targets = snapTargets(mapItems(notes, [], []), PAGES, HEIGHT);
    expect(targets.length).toBeLessThan(PAGES / 3);
    expect(targets.every((t) => t.pull === 0)).toBe(true);
    expect(reachablePages(targets, PAGES, HEIGHT)).toEqual(unsnapped);
  });

  it('copes with nothing to snap to and an unmeasured track', () => {
    expect(snapAt(snapTargets([], PAGES, HEIGHT), 100)).toBeNull();
    expect(snapTargets(mapItems([note(3, 0.5)], [], []), PAGES, 0)).toEqual([]);
  });
});
