import { describe, expect, it } from 'vitest';
import { NOTE_COLORS } from '@/lib/types';
import { annotationColor, bounds, fractionToPdf, noteRect, quadPoints, type PageBox } from './geometry';

const box: PageBox = { x: 10, y: 20, width: 200, height: 100, rotation: 0 };

describe('display fractions to PDF space', () => {
  it.each([
    [0, [60, 95]],
    [90, [60, 45]],
    [180, [160, 45]],
    [270, [160, 95]],
    [-90, [160, 95]],
  ])('inverts the %i° viewport including its crop origin', (rotation, expected) => {
    expect(fractionToPdf(0.25, 0.25, { ...box, rotation })).toEqual(expected);
  });

  it('orders each quad as displayed top-left, top-right, bottom-left, bottom-right', () => {
    const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(quadPoints(rect, box)).toEqual([30, 100, 90, 100, 30, 60, 90, 60].map((n) => expect.closeTo(n)));
    expect(quadPoints(rect, { ...box, rotation: 90 })).toEqual(
      [50, 30, 50, 60, 130, 30, 130, 60].map((n) => expect.closeTo(n)),
    );
    expect(bounds(quadPoints(rect, box))).toEqual([30, 60, 90, 100].map((n) => expect.closeTo(n)));
  });

  it.each([0, 90, 180, 270])('places an 18pt note at the visible right edge at %i°', (rotation) => {
    const rotated = { ...box, rotation };
    const rect = noteRect(0.5, rotated);
    expect(rect[2] - rect[0]).toBeCloseTo(18);
    expect(rect[3] - rect[1]).toBeCloseTo(18);
    const edge = fractionToPdf(1, 0.5, rotated);
    expect(edge[0] >= rect[0] - 0.00001 && edge[0] <= rect[2] + 0.00001).toBe(true);
    expect(edge[1] >= rect[1] - 0.00001 && edge[1] <= rect[3] + 0.00001).toBe(true);
  });

  it('maps all five note colours to distinct RGB values in range', () => {
    const colors = NOTE_COLORS.map(annotationColor);
    expect(new Set(colors.map(String)).size).toBe(5);
    expect(colors.flat().every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});
