import { afterEach, describe, expect, it } from 'vitest';
import { useReaderStore } from '@/features/reader/readerStore';
import type { OutlineItem } from '@/lib/types';
import { buildCandidates } from './candidates';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0 },
  children,
});

function contentsAt(outline: OutlineItem[], page: number) {
  useReaderStore.setState({ outline, location: { page, offset: 0 }, pageLabels: null });
  return buildCandidates()
    .filter((entry) => entry.group === 'Contents')
    .map((entry) => ({ title: entry.title, suggested: !!entry.suggested, current: !!entry.current }));
}

afterEach(() => useReaderStore.setState({ outline: [], location: { page: 1, offset: 0 } }));

describe('contents candidates', () => {
  it('suggests chapters and marks the current one, looking through a root entry', () => {
    const outline = [
      item('Mechanics', 1, [item('Kinematics', 3, [item('Velocity', 6)]), item('Forces', 11)]),
    ];
    expect(contentsAt(outline, 7)).toEqual([
      { title: 'Mechanics', suggested: false, current: false },
      { title: 'Kinematics', suggested: true, current: true },
      { title: 'Velocity', suggested: false, current: false },
      { title: 'Forces', suggested: true, current: false },
    ]);
  });

  it('treats the chapters of destination-less parts as the chapter level', () => {
    const outline = [item('Part I', null, [item('Ch 1', 3), item('Ch 2', 9)]), item('Part II', null)];
    expect(contentsAt(outline, 12)).toEqual([
      { title: 'Ch 1', suggested: true, current: false },
      { title: 'Ch 2', suggested: true, current: true },
    ]);
  });

  it('has no current chapter before the first one', () => {
    expect(contentsAt([item('One', 3), item('Two', 9)], 1).some((entry) => entry.current)).toBe(false);
  });
});
