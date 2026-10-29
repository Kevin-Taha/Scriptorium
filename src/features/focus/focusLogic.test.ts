import { describe, expect, it } from 'vitest';
import { REVEAL_ZONE, rulerBandHeight, shouldReveal, spotlightRule } from './focusLogic';

describe('toolbar reveal', () => {
  it('brings the toolbar back only from the top strip', () => {
    expect(shouldReveal(0, true)).toBe(true);
    expect(shouldReveal(REVEAL_ZONE, true)).toBe(true);
    expect(shouldReveal(REVEAL_ZONE + 1, true)).toBe(false);
  });

  it('waits for the pointer to leave the top strip after entering from the toolbar', () => {
    expect(shouldReveal(4, false)).toBe(false);
  });
});

describe('spotlight rule', () => {
  it('dims every page row but the given one, only in focus mode', () => {
    const rule = spotlightRule(12);
    expect(rule).toContain('html.focus-mode .reader__page:not([data-page="12"])');
    expect(rule).toContain('opacity: var(--focus-page-opacity)');
  });
});

describe('reading ruler band', () => {
  it('grows with the zoom level within sensible bounds', () => {
    expect(rulerBandHeight(1)).toBe(38);
    expect(rulerBandHeight(2)).toBeGreaterThan(rulerBandHeight(1));
    expect(rulerBandHeight(0.1)).toBe(30);
    expect(rulerBandHeight(10)).toBe(170);
  });
});
