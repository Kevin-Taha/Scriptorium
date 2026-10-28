import { describe, expect, it } from 'vitest';
import {
  DOCK_MIN_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  clampDockWidth,
  clampLayout,
  maxSize,
  movedLayout,
  resizedLayout,
} from './geometry';
import { DEFAULT_LAYOUT } from './model';

const bounds = { width: 1000, height: 800 };

describe('clampLayout', () => {
  it('leaves a sensible layout alone', () => {
    expect(clampLayout(DEFAULT_LAYOUT, bounds)).toEqual(DEFAULT_LAYOUT);
  });

  it('limits size to the minimum and 70% of the reading area', () => {
    const small = clampLayout({ ...DEFAULT_LAYOUT, width: 10, height: 10 }, bounds);
    expect([small.width, small.height]).toEqual([MIN_WIDTH, MIN_HEIGHT]);
    const big = clampLayout({ ...DEFAULT_LAYOUT, width: 5000, height: 5000 }, bounds);
    expect([big.width, big.height]).toEqual([700, 560]);
  });

  it('keeps the pane inside the area after the window shrinks', () => {
    const narrow = { width: 500, height: 420 };
    const layout = clampLayout({ right: 400, bottom: 380, width: 360, height: 480 }, narrow);
    expect(layout.width).toBeLessThanOrEqual(maxSize(narrow).width);
    expect(layout.right + layout.width).toBeLessThanOrEqual(narrow.width);
    expect(layout.bottom + layout.height).toBeLessThanOrEqual(narrow.height);
    expect(layout.right).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeGreaterThanOrEqual(0);
  });

  it('lets a collapsed header travel further than the full pane could', () => {
    const tall = { ...DEFAULT_LAYOUT, bottom: 700 };
    expect(clampLayout(tall, bounds).bottom).toBe(bounds.height - DEFAULT_LAYOUT.height);
    expect(clampLayout(tall, bounds, 38).bottom).toBe(700);
  });
});

describe('movedLayout', () => {
  it('follows the pointer but never leaves the area', () => {
    expect(movedLayout(DEFAULT_LAYOUT, -100, -50, bounds)).toMatchObject({ right: 116, bottom: 66 });
    expect(movedLayout(DEFAULT_LAYOUT, 500, 500, bounds)).toMatchObject({ right: 0, bottom: 0 });
    const far = movedLayout(DEFAULT_LAYOUT, -5000, -5000, bounds);
    expect(far.right).toBe(bounds.width - DEFAULT_LAYOUT.width);
    expect(far.bottom).toBe(bounds.height - DEFAULT_LAYOUT.height);
  });
});

describe('resizedLayout', () => {
  it('drags the top-left corner, keeping the bottom-right fixed', () => {
    const next = resizedLayout(DEFAULT_LAYOUT, 'nw', -100, -60, bounds);
    expect(next).toMatchObject({ right: 16, bottom: 16, width: 460, height: 540 });
  });

  it('drags the bottom-left corner, keeping the top-right fixed', () => {
    const start = { right: 16, bottom: 200, width: 360, height: 300 };
    const next = resizedLayout(start, 'sw', -80, 60, bounds);
    expect(next.right).toBe(16);
    expect(next.width).toBe(440);
    expect(next.height).toBe(360);
    expect(next.bottom).toBe(140);
  });

  it('stops at the minimum size without moving the anchored corner', () => {
    const next = resizedLayout(DEFAULT_LAYOUT, 'nw', 900, 900, bounds);
    expect([next.width, next.height]).toEqual([MIN_WIDTH, MIN_HEIGHT]);
    expect([next.right, next.bottom]).toEqual([16, 16]);
  });

  it('stops at the maximum size', () => {
    const next = resizedLayout(DEFAULT_LAYOUT, 'nw', -900, -900, bounds);
    expect([next.width, next.height]).toEqual([700, 560]);
  });

  it('works for the right-hand corners too', () => {
    const start = { right: 300, bottom: 300, width: 300, height: 300 };
    const next = resizedLayout(start, 'se', 50, 40, bounds);
    expect(next).toMatchObject({ width: 350, height: 340, right: 250, bottom: 260 });
  });
});

describe('clampDockWidth', () => {
  it('stays between the minimum and half the reading area', () => {
    expect(clampDockWidth(10, bounds)).toBe(DOCK_MIN_WIDTH);
    expect(clampDockWidth(380, bounds)).toBe(380);
    expect(clampDockWidth(9000, bounds)).toBe(500);
  });
});
