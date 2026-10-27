import { describe, expect, it } from 'vitest';
import type { Highlight, MarginNote } from '@/lib/types';
import {
  annotationColors,
  buildAnnotations,
  groupAnnotationsByPage,
  sameAnnotations,
  type AnnotationItem,
} from './annotations';

let sequence = 0;
function note(overrides: Partial<MarginNote> = {}): MarginNote {
  sequence += 1;
  return {
    id: `n${sequence}`,
    docId: 'doc',
    page: 1,
    y: 0.5,
    text: 'note',
    color: 'amber',
    createdAt: sequence,
    updatedAt: sequence,
    ...overrides,
  };
}

function highlight(overrides: Partial<Highlight> & { top?: number } = {}): Highlight {
  sequence += 1;
  const { top = 0.4, ...rest } = overrides;
  return {
    id: `h${sequence}`,
    docId: 'doc',
    page: 1,
    rects: [{ x: 0.1, y: top, w: 0.5, h: 0.02 }],
    text: 'highlighted',
    color: 'sky',
    createdAt: sequence,
    updatedAt: sequence,
    ...rest,
  };
}

describe('buildAnnotations', () => {
  it('interleaves notes and highlights by page and vertical position', () => {
    const n = note({ id: 'n', page: 2, y: 0.3 });
    const h1 = highlight({ id: 'h1', page: 2, top: 0.1 });
    const h2 = highlight({ id: 'h2', page: 1, top: 0.9 });
    const items = buildAnnotations([n], [h1, h2]);
    expect(items.map((i) => i.id)).toEqual(['h2', 'h1', 'n']);
    expect(items.map((i) => i.kind)).toEqual(['highlight', 'highlight', 'note']);
  });

  it('places a highlight at the middle of its first line', () => {
    const [item] = buildAnnotations([], [highlight({ top: 0.4 })]);
    expect(item.y).toBeCloseTo(0.41);
  });

  it('shows a highlight through its note instead of twice', () => {
    const h = highlight({ id: 'h' });
    const n = note({ id: 'n', highlightId: 'h', y: 0.41 });
    const items = buildAnnotations([n], [h]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'note', id: 'n', highlight: h });
  });

  it('ignores a link to a highlight that no longer exists', () => {
    const items = buildAnnotations([note({ id: 'n', highlightId: 'gone' })], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'note' });
    expect((items[0] as Extract<AnnotationItem, { kind: 'note' }>).highlight).toBeUndefined();
  });

  it('keeps a highlight standalone when its note was unlinked', () => {
    const items = buildAnnotations([note({ id: 'n', highlightId: undefined })], [highlight({ id: 'h' })]);
    expect(items.map((i) => i.kind).sort()).toEqual(['highlight', 'note']);
  });

  it('breaks ties by creation time', () => {
    const a = note({ id: 'a', y: 0.5, createdAt: 9 });
    const b = highlight({ id: 'b', top: 0.49, createdAt: 3 }); // centre 0.5
    expect(buildAnnotations([a], [b]).map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('groupAnnotationsByPage', () => {
  it('groups consecutive items of a page', () => {
    const items = buildAnnotations(
      [note({ id: 'a', page: 3 }), note({ id: 'b', page: 1 })],
      [highlight({ id: 'c', page: 3, top: 0.01 })],
    );
    expect(groupAnnotationsByPage(items).map((g) => [g.page, g.items.map((i) => i.id)])).toEqual([
      [1, ['b']],
      [3, ['c', 'a']],
    ]);
  });

  it('is empty for nothing', () => {
    expect(groupAnnotationsByPage([])).toEqual([]);
  });
});

describe('annotationColors', () => {
  it('lists a note’s colour and a differing highlight colour', () => {
    const [plain] = buildAnnotations([note({ color: 'rose' })], []);
    expect(annotationColors(plain)).toEqual(['rose']);

    const h = highlight({ id: 'h', color: 'sky' });
    const [linked] = buildAnnotations([note({ color: 'rose', highlightId: 'h' })], [h]);
    expect(annotationColors(linked)).toEqual(['rose', 'sky']);

    const [same] = buildAnnotations([note({ color: 'sky', highlightId: 'h' })], [h]);
    expect(annotationColors(same)).toEqual(['sky']);

    const [only] = buildAnnotations([], [h]);
    expect(annotationColors(only)).toEqual(['sky']);
  });
});

describe('sameAnnotations', () => {
  it('compares underlying objects, not the wrappers', () => {
    const n = note();
    const h = highlight();
    expect(sameAnnotations(buildAnnotations([n], [h]), buildAnnotations([n], [h]))).toBe(true);
    expect(sameAnnotations(buildAnnotations([n], [h]), buildAnnotations([{ ...n }], [h]))).toBe(false);
    expect(sameAnnotations(buildAnnotations([n], [h]), buildAnnotations([n], [{ ...h }]))).toBe(false);
    expect(sameAnnotations(buildAnnotations([n], []), buildAnnotations([n], [h]))).toBe(false);
  });

  it('distinguishes linked from unlinked', () => {
    const h = highlight({ id: 'h' });
    const n = note({ highlightId: 'h' });
    expect(
      sameAnnotations(buildAnnotations([n], [h]), buildAnnotations([{ ...n, highlightId: undefined }], [h])),
    ).toBe(false);
  });
});
