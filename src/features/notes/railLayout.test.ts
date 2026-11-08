import { describe, expect, it } from 'vitest';
import { layoutRailMarkers, RAIL_MARKER_GAP, RAIL_MARKER_SIZE } from './railLayout';

const half = RAIL_MARKER_SIZE / 2;
const step = RAIL_MARKER_SIZE + RAIL_MARKER_GAP;

describe('layoutRailMarkers', () => {
  it('centres each marker on its anchor when there is room', () => {
    const placed = layoutRailMarkers(
      [
        { id: 'a', anchor: 100 },
        { id: 'b', anchor: 300 },
      ],
      800,
    );
    expect(placed).toEqual([
      { id: 'a', anchor: 100, top: 100 - half, height: RAIL_MARKER_SIZE },
      { id: 'b', anchor: 300, top: 300 - half, height: RAIL_MARKER_SIZE },
    ]);
  });

  it('pushes a crowded marker below the one above, keeping anchor order', () => {
    const placed = layoutRailMarkers(
      [
        { id: 'late', anchor: 105 },
        { id: 'early', anchor: 100 },
      ],
      800,
    );
    expect(placed.map((p) => p.id)).toEqual(['early', 'late']);
    expect(placed[1].top).toBe(placed[0].top + step);
  });

  it('keeps markers on the page near its edges', () => {
    const top = layoutRailMarkers([{ id: 'a', anchor: 2 }], 800);
    expect(top[0].top).toBe(0);
    const bottom = layoutRailMarkers([{ id: 'a', anchor: 798 }], 800);
    expect(bottom[0].top).toBe(800 - RAIL_MARKER_SIZE);
  });

  it('slides a stack that runs off the bottom back up without overlaps', () => {
    const anchors = [790, 792, 794].map((anchor, i) => ({ id: String(i), anchor }));
    const placed = layoutRailMarkers(anchors, 800);
    expect(placed.at(-1)!.top).toBe(800 - RAIL_MARKER_SIZE);
    expect(placed[1].top).toBe(placed[0].top + step);
    expect(placed[2].top).toBe(placed[1].top + step);
  });

  it('keeps order from the top when the page cannot hold every marker', () => {
    const anchors = [10, 20, 30].map((anchor, i) => ({ id: String(i), anchor }));
    const placed = layoutRailMarkers(anchors, 60);
    expect(placed.map((p) => p.top)).toEqual([0, step, 2 * step]);
  });
});
