import { describe, expect, it } from 'vitest';
import {
  layoutNotes,
  NOTE_ATTACH_OFFSET,
  NOTE_COMPACT_HEIGHT,
  NOTE_GAP,
  overlapsPlacement,
  type NoteBox,
  type NotePlacement,
} from './layoutNotes';

const PAGE = 1000;
const box = (id: string, anchor: number, height = 80, pinned = false): NoteBox => ({
  id,
  anchor,
  height,
  pinned,
});

function expectNoOverlap(placed: NotePlacement[]) {
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1];
    expect(placed[i].top).toBeGreaterThanOrEqual(prev.top + prev.height + NOTE_GAP - 1e-9);
  }
}

describe('layoutNotes', () => {
  it('returns nothing for an empty page', () => {
    expect(layoutNotes([], PAGE)).toEqual([]);
  });

  it('attaches an isolated note level with its anchor', () => {
    const [p] = layoutNotes([box('a', 300)], PAGE);
    expect(p.top).toBe(300 - NOTE_ATTACH_OFFSET);
    expect(p.attach).toBe(300);
    expect(p.displaced).toBe(false);
    expect(p.compact).toBe(false);
    expect(p.height).toBe(80);
  });

  it('keeps cards inside the top edge of the page', () => {
    const [p] = layoutNotes([box('a', 4)], PAGE);
    expect(p.top).toBe(0);
    expect(p.attach).toBe(NOTE_ATTACH_OFFSET);
    expect(p.displaced).toBe(true);
  });

  it('leaves well-separated notes at their anchors', () => {
    const placed = layoutNotes([box('a', 100), box('b', 400), box('c', 700)], PAGE);
    expect(placed.map((p) => p.top)).toEqual([84, 384, 684]);
    expect(placed.every((p) => !p.displaced)).toBe(true);
  });

  it('pushes colliding notes below the previous card with an 8px gap', () => {
    const placed = layoutNotes([box('a', 300), box('b', 310), box('c', 320), box('d', 330)], PAGE);
    expect(placed.map((p) => p.top)).toEqual([284, 372, 460, 548]);
    expect(placed.map((p) => p.displaced)).toEqual([false, true, true, true]);
    expectNoOverlap(placed);
  });

  it('keeps anchors unchanged while displacing cards', () => {
    const placed = layoutNotes([box('a', 300), box('b', 310), box('c', 320)], PAGE);
    expect(placed.map((p) => p.anchor)).toEqual([300, 310, 320]);
  });

  it('preserves order for notes sharing the same anchor', () => {
    const placed = layoutNotes([box('first', 500), box('second', 500), box('third', 500)], PAGE);
    expect(placed.map((p) => p.id)).toEqual(['first', 'second', 'third']);
    expectNoOverlap(placed);
  });

  it('orders cards by anchor when given out of order', () => {
    const placed = layoutNotes([box('low', 600), box('high', 100)], PAGE);
    expect(placed.map((p) => p.id)).toEqual(['high', 'low']);
  });

  it('lets a gap between anchors absorb the displacement', () => {
    const placed = layoutNotes([box('a', 100, 200), box('b', 330)], PAGE);
    expect(placed[0].top).toBe(84);
    expect(placed[1].top).toBe(314);
    expect(placed[1].displaced).toBe(false);
  });

  it('compacts only as many trailing cards as needed to fit the page', () => {
    const boxes = [box('a', 500, 150), box('b', 600, 150), box('c', 700, 150), box('d', 800, 150)];
    const placed = layoutNotes(boxes, PAGE);
    // a: 484–634, b: 642–792, c: 800–950 fits, d compact: 958–990
    expect(placed.map((p) => p.compact)).toEqual([false, false, false, true]);
    expect(placed[3].top).toBe(958);
    expect(placed[3].height).toBe(NOTE_COMPACT_HEIGHT);
    expect(placed.at(-1)!.top + placed.at(-1)!.height).toBeLessThanOrEqual(PAGE);
    expectNoOverlap(placed);
  });

  it('compacts several trailing cards when one is not enough', () => {
    const boxes = [box('a', 500, 200), box('b', 600, 200), box('c', 650, 200), box('d', 700, 200)];
    const placed = layoutNotes(boxes, PAGE);
    expect(placed.map((p) => p.compact)).toEqual([false, false, true, true]);
    expect(placed.at(-1)!.top + placed.at(-1)!.height).toBeLessThanOrEqual(PAGE);
    expectNoOverlap(placed);
  });

  it('never compacts pinned cards', () => {
    const boxes = [box('a', 700, 200), box('b', 800, 200, true), box('c', 900, 200)];
    const placed = layoutNotes(boxes, PAGE);
    expect(placed[1].compact).toBe(false);
    expect(placed[1].height).toBe(200);
    expectNoOverlap(placed);
  });

  it('leaves cards before a pinned card alone and slides the stack up instead', () => {
    const boxes = [
      box('a', 620, 42),
      box('b', 700, 200, true),
      box('c', 750, 90),
      box('d', 800, 90),
      box('e', 880, 90),
    ];
    const placed = layoutNotes(boxes, PAGE);
    expect(placed.map((p) => p.compact)).toEqual([false, false, true, true, true]);
    expect(placed.at(-1)!.top + placed.at(-1)!.height).toBeLessThanOrEqual(PAGE);
    expectNoOverlap(placed);
  });

  it('slides the stack up when compact cards would still pass the page bottom', () => {
    const boxes = [box('a', 990), box('b', 995), box('c', 999)];
    const placed = layoutNotes(boxes, PAGE);
    expect(placed.map((p) => p.compact)).toEqual([true, true, true]);
    expect(placed.at(-1)!.top + placed.at(-1)!.height).toBeLessThanOrEqual(PAGE);
    expectNoOverlap(placed);
    expect(placed.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('never overlaps, even when the stack is taller than the page', () => {
    const boxes = Array.from({ length: 12 }, (_, i) => box(`n${i}`, 20 + i * 5, 90));
    const placed = layoutNotes(boxes, 300);
    expectNoOverlap(placed);
    expect(placed[0].top).toBeGreaterThanOrEqual(0);
  });

  it('holds its invariants for arbitrary note sets', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let round = 0; round < 200; round++) {
      const count = 1 + Math.floor(random() * 10);
      const boxes = Array.from({ length: count }, (_, i) =>
        box(`n${i}`, Math.floor(random() * PAGE), 50 + Math.floor(random() * 200)),
      );
      const placed = layoutNotes(boxes, PAGE);
      expect(placed).toHaveLength(count);
      expect(placed.map((p) => p.anchor)).toEqual(placed.map((p) => p.anchor).sort((a, b) => a - b));
      expectNoOverlap(placed);
      expect(placed[0].top).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps stacks that fit on the page entirely inside it', () => {
    const placed = layoutNotes([box('a', 100), box('b', 110), box('c', 120)], PAGE);
    expect(placed.at(-1)!.top + placed.at(-1)!.height).toBeLessThanOrEqual(PAGE);
    expect(placed.every((p) => !p.compact)).toBe(true);
  });
});

describe('overlapsPlacement', () => {
  const placed = layoutNotes([box('a', 116, 100)], PAGE); // occupies 100–200

  it('detects spans that intersect a card', () => {
    expect(overlapsPlacement(placed, 150, 182)).toBe(true);
    expect(overlapsPlacement(placed, 60, 110)).toBe(true);
  });

  it('allows spans clear of every card', () => {
    expect(overlapsPlacement(placed, 210, 242)).toBe(false);
    expect(overlapsPlacement(placed, 40, 90)).toBe(false);
  });

  it('honours the margin', () => {
    expect(overlapsPlacement(placed, 204, 236, 8)).toBe(true);
    expect(overlapsPlacement(placed, 204, 236, 0)).toBe(false);
  });
});
