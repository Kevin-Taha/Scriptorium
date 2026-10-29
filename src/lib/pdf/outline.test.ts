import { describe, expect, it } from 'vitest';
import type { OutlineItem } from '../types';
import { chapterEntries } from './outline';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0.2 },
  children,
});

const summary = (outline: OutlineItem[], pageCount?: number) =>
  chapterEntries(outline, pageCount).map((entry) => [entry.title, entry.location.page]);

describe('chapterEntries', () => {
  it('takes the top level in page order, keeping each chapter’s sections and destination', () => {
    const outline = [item('Two', 11, [item('2.1', 12)]), item('One', 3, [item('1.1', 4), item('1.2', 6)])];
    expect(summary(outline)).toEqual([
      ['One', 3],
      ['Two', 11],
    ]);
    const [one] = chapterEntries(outline);
    expect(one.location).toEqual({ page: 3, offset: 0.2 });
    expect(one.children.map((section) => section.title)).toEqual(['1.1', '1.2']);
  });

  it('looks through a lone root entry, with or without a destination', () => {
    const chapters = [item('Kinematics', 3), item('Forces', 11)];
    const expected = [
      ['Kinematics', 3],
      ['Forces', 11],
    ];
    expect(summary([item('Mechanics', 1, chapters)])).toEqual(expected);
    expect(summary([item('Mechanics', null, chapters)])).toEqual(expected);
  });

  it('keeps a lone entry that has no children', () => {
    expect(summary([item('Everything', 1)])).toEqual([['Everything', 1]]);
  });

  it('lets the children of a heading without a destination stand in as chapters', () => {
    const outline = [
      item('Part I', null, [item('Ch 1', 3), item('Ch 2', 9)]),
      item('Part II', null, [item('Ch 3', 20), item('Ch 4', 27)]),
    ];
    expect(summary(outline)).toEqual([
      ['Ch 1', 3],
      ['Ch 2', 9],
      ['Ch 3', 20],
      ['Ch 4', 27],
    ]);
  });

  it('handles a mix of chapters and parts, treating a part with a destination as a chapter', () => {
    const outline = [
      item('Preface', 2),
      item('Part I', null, [item('Ch 1', 3, [item('1.1', 4)]), item('Ch 2', 9)]),
      item('Part II', 20, [item('Ch 3', 21)]),
      item('Index', 30),
    ];
    expect(summary(outline)).toEqual([
      ['Preface', 2],
      ['Ch 1', 3],
      ['Ch 2', 9],
      ['Part II', 20],
      ['Index', 30],
    ]);
    expect(chapterEntries(outline)[1].children.map((section) => section.title)).toEqual(['1.1']);
  });

  it('digs through nested wrappers', () => {
    const nested = [
      item('Book', 1, [item('Volume', null, [item('Part I', null, [item('Ch 1', 3), item('Ch 2', 9)])])]),
    ];
    expect(summary(nested)).toEqual([
      ['Ch 1', 3],
      ['Ch 2', 9],
    ]);
    const parts = [item('Book', 1, [item('Part I', null, [item('Ch 1', 3)]), item('Part II', 20)])];
    expect(summary(parts)).toEqual([
      ['Ch 1', 3],
      ['Part II', 20],
    ]);
  });

  it('is empty without an outline or any usable entry', () => {
    expect(chapterEntries([])).toEqual([]);
    expect(summary([item('Missing', null), item('  ', 4), item('Part', null, [item('Gone', null)])])).toEqual(
      [],
    );
  });

  it('trims titles and keeps the first entry for a page', () => {
    expect(
      summary([item(' Second ', 11), item('First', 3), item('Duplicate', 11), item('Again', 3)]),
    ).toEqual([
      ['First', 3],
      ['Second', 11],
    ]);
  });

  it('ignores starts outside the book when given its page count', () => {
    const outline = [item('A', 1), item('B', 36), item('Beyond', 37), item('Zero', 0), item('Half', 2.5)];
    expect(summary(outline, 36)).toEqual([
      ['A', 1],
      ['B', 36],
    ]);
    expect(summary(outline)).toHaveLength(3);
  });
});
