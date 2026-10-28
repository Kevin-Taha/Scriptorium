import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextStamp } from './clock';

afterEach(() => vi.useRealTimers());

describe('nextStamp', () => {
  it('uses the current time when it is ahead of the previous version', () => {
    vi.useFakeTimers({ now: 1_000 });
    expect(nextStamp(400)).toBe(1_000);
  });

  it('outranks a version stamped by a device whose clock is ahead', () => {
    vi.useFakeTimers({ now: 1_000 });
    expect(nextStamp(5_000)).toBe(5_001);
    expect(nextStamp()).toBe(1_000);
  });
});
