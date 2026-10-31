import { describe, expect, it } from 'vitest';
import type { OutlineItem } from '@/lib/types';
import { ancestorKeys, currentOutlineEntry, outlineEntries, splitSectionNumber } from './outlineCurrent';

const item = (title: string, page: number | null, offset = 0, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset },
  children,
});
const entries = outlineEntries([
  item('Chapter', 1, 0, [item('First', 2, 0.1), item('Second', 2, 0.6, [item('Deep', 2, 0.6)])]),
  item('Unresolved', null, 0, [item('Later', 5)]),
]);

describe('current outline section', () => {
  it('selects the latest page and nearest preceding offset, breaking ties by depth', () => {
    expect(currentOutlineEntry(entries, { page: 1, offset: 0 })?.item.title).toBe('Chapter');
    expect(currentOutlineEntry(entries, { page: 2, offset: 0 })?.item.title).toBe('First');
    expect(currentOutlineEntry(entries, { page: 2, offset: 0.4 })?.item.title).toBe('First');
    expect(currentOutlineEntry(entries, { page: 2, offset: 0.6 })?.item.title).toBe('Deep');
    expect(currentOutlineEntry(entries, { page: 6, offset: 0 })?.item.title).toBe('Later');
  });
  it('returns null before any destination and derives ancestor paths', () => {
    expect(currentOutlineEntry(entries, { page: 0, offset: 0 })).toBeNull();
    expect(ancestorKeys('0.1.0')).toEqual(['0', '0.1']);
    expect(ancestorKeys('0')).toEqual([]);
  });
  it('splits a leading section number from the title', () => {
    expect(splitSectionNumber('2.2 Hierarchical Data')).toEqual({ number: '2.2', text: 'Hierarchical Data' });
    expect(splitSectionNumber('2.2.1 Sequences')).toEqual({ number: '2.2.1', text: 'Sequences' });
    expect(splitSectionNumber('3 Modularity')).toEqual({ number: '3', text: 'Modularity' });
    expect(splitSectionNumber('1. Introduction')).toEqual({ number: '1.', text: 'Introduction' });
    expect(splitSectionNumber('A.1 Proofs')).toEqual({ number: 'A.1', text: 'Proofs' });
    expect(splitSectionNumber('IV. Results')).toEqual({ number: 'IV.', text: 'Results' });
    for (const title of ['Chapter 2: Laws', '1984 and After', 'A Pattern Language', '3D Graphics', '2.1']) {
      expect(splitSectionNumber(title)).toBeNull();
    }
  });
});
