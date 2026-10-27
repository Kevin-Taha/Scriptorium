import { describe, expect, it } from 'vitest';
import { placeFloating } from './floatingPosition';

const area = { top: 0, left: 0, right: 1440, bottom: 900 };
const size = { width: 300, height: 32 };

describe('placeFloating', () => {
  it('sits 8px above the anchor, centred on it', () => {
    expect(placeFloating({ x: 700, top: 400, bottom: 420 }, size, area)).toEqual({ top: 360, left: 550 });
  });

  it('flips below when there is no room above', () => {
    expect(placeFloating({ x: 700, top: 30, bottom: 50 }, size, { ...area, top: 48 })).toEqual({
      top: 58,
      left: 550,
    });
  });

  it('goes below a multi-line selection when it fits', () => {
    expect(placeFloating({ x: 700, top: 400, bottom: 420, preferBelow: true }, size, area).top).toBe(428);
  });

  it('stays above when preferring below would run off the bottom', () => {
    expect(placeFloating({ x: 700, top: 860, bottom: 880, preferBelow: true }, size, area).top).toBe(820);
  });

  it('keeps the control inside the area horizontally', () => {
    expect(placeFloating({ x: 10, top: 400, bottom: 420 }, size, area).left).toBe(8);
    expect(placeFloating({ x: 1435, top: 400, bottom: 420 }, size, area).left).toBe(1132);
  });

  it('keeps clear of a sidebar on the left', () => {
    expect(placeFloating({ x: 320, top: 400, bottom: 420 }, size, { ...area, left: 300 }).left).toBe(308);
  });

  it('never lets the control fall off the bottom edge', () => {
    expect(placeFloating({ x: 700, top: 20, bottom: 895 }, size, area).top).toBe(860);
  });
});
