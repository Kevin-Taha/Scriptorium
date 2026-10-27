import { afterEach, describe, expect, it, vi } from 'vitest';
import { DENSITY_STORAGE_KEY, parseDensity, readDensity, writeDensity } from './reviewDensity';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('parseDensity', () => {
  it('accepts "dense" and defaults to comfortable for anything else', () => {
    expect(parseDensity('dense')).toBe('dense');
    expect(parseDensity('comfortable')).toBe('comfortable');
    expect(parseDensity('compact')).toBe('comfortable');
    expect(parseDensity(null)).toBe('comfortable');
  });
});

describe('readDensity / writeDensity', () => {
  it('round-trips through localStorage', () => {
    expect(readDensity()).toBe('comfortable');
    writeDensity('dense');
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('dense');
    expect(readDensity()).toBe('dense');
  });

  it('tolerates unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readDensity()).toBe('comfortable');
    expect(() => writeDensity('dense')).not.toThrow();
  });
});
