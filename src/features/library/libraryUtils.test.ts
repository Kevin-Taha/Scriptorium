import { describe, expect, it } from 'vitest';
import { formatOpened, progressPercent } from './libraryUtils';

describe('library progress', () => {
  it('uses the saved page and intra-page offset', () => {
    expect(progressPercent(10)).toBe(0);
    expect(progressPercent(10, { page: 1, offset: 0 })).toBe(0);
    expect(progressPercent(10, { page: 4, offset: 0.5 })).toBe(35);
  });

  it('does not round up to 100 before the end of the last page', () => {
    expect(progressPercent(612, { page: 611, offset: 1 })).toBe(99);
    expect(progressPercent(612, { page: 612, offset: 0.5 })).toBe(99);
    expect(progressPercent(612, { page: 612, offset: 0.99 })).toBe(100);
    expect(progressPercent(1, { page: 1, offset: 1 })).toBe(100);
  });

  it('clamps corrupt values and handles missing page counts', () => {
    expect(progressPercent(0, { page: 1, offset: 0 })).toBe(0);
    expect(progressPercent(10, { page: -1, offset: -1 })).toBe(0);
    expect(progressPercent(10, { page: 50, offset: 2 })).toBe(100);
    expect(progressPercent(10, { page: Number.NaN, offset: 0 })).toBe(0);
  });
});

describe('library dates', () => {
  it('formats recent opening times', () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(formatOpened(now, now)).toBe('Opened just now');
    expect(formatOpened(now - 2 * 60 * 60 * 1000, now)).toBe('Opened 2 hours ago');
  });
});
