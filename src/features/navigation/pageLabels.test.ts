import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useReaderStore } from '../reader/readerStore';
import { formatPageRef, pageLabelFor, resolvePageInput, usePageLabel } from './pageLabels';

const labels = ['i', 'ii', 'iii', 'iv', '1', '2', 'A-3', '2'];

describe('printed page labels', () => {
  it('formats labels and falls back to PDF indices when a label is absent', () => {
    expect(pageLabelFor(labels, 2)).toBe('ii');
    expect(pageLabelFor(null, 2)).toBe('2');
    expect(pageLabelFor([''], 1)).toBe('1');
    expect(pageLabelFor(labels, 20)).toBe('20');
    expect(formatPageRef(labels, 3)).toBe('p. iii');
    expect(formatPageRef(null, 142)).toBe('p. 142');
  });

  it('reacts to document label changes through the hook', () => {
    useReaderStore.setState({ pageLabels: null });
    const { result, unmount } = renderHook(() => usePageLabel(2));
    expect(result.current).toBe('2');
    act(() => useReaderStore.setState({ pageLabels: labels }));
    expect(result.current).toBe('ii');
    act(() => useReaderStore.setState({ pageLabels: null }));
    expect(result.current).toBe('2');
    unmount();
  });

  it('resolves case-insensitive roman and prefixed labels and picks the first duplicate', () => {
    expect(resolvePageInput(labels, ' III ', 8)).toBe(3);
    expect(resolvePageInput(labels, 'a-3', 8)).toBe(7);
    expect(resolvePageInput(labels, '2', 8)).toBe(6);
  });

  it('gives numeric printed labels precedence over PDF indices, with # to force an index', () => {
    expect(resolvePageInput(labels, '1', 8)).toBe(5);
    expect(resolvePageInput(labels, '#1', 8)).toBe(1);
    expect(resolvePageInput(labels, '#02', 8)).toBe(2);
    expect(resolvePageInput(['1', '2', '3'], '2', 3)).toBe(2);
    expect(resolvePageInput(labels, '8', 8)).toBe(8);
    expect(resolvePageInput(null, '02', 8)).toBe(2);
    expect(resolvePageInput(null, '#2', 8)).toBe(2);
  });

  it('rejects invalid and out-of-range values and ignores labels beyond the page count', () => {
    for (const value of [
      '',
      ' ',
      '0',
      '-1',
      '+1',
      '1.5',
      '2e0',
      '#0',
      '#9',
      '#-1',
      '999999999999999999999',
    ]) {
      expect(resolvePageInput(labels, value, 8)).toBeNull();
    }
    expect(resolvePageInput(labels, 'A-3', 6)).toBeNull();
    expect(resolvePageInput(labels, '8', 7)).toBeNull();
    expect(resolvePageInput(null, 'xii', 8)).toBeNull();
  });
});
