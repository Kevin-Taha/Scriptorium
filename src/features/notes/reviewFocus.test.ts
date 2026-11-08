import { describe, expect, it } from 'vitest';
import type { AnnotationItem } from './annotations';
import { adjacentItem, neighbourItem } from './reviewFocus';

function item(id: string, page: number): AnnotationItem {
  const note = {
    id,
    docId: 'book',
    page,
    y: 0.5,
    text: id,
    color: 'amber' as const,
    createdAt: 1,
    updatedAt: 1,
  };
  return { kind: 'note', id, page, y: note.y, createdAt: note.createdAt, note };
}

describe('review focus across the complete filtered list', () => {
  const items = [item('a', 1), item('b', 20), item('c', 50)];

  it('starts at either end and moves across page boundaries', () => {
    expect(adjacentItem(items, undefined, 1)?.id).toBe('a');
    expect(adjacentItem(items, undefined, -1)?.id).toBe('c');
    expect(adjacentItem(items, 'a', 1)?.id).toBe('b');
    expect(adjacentItem(items, 'c', -1)?.id).toBe('b');
    expect(adjacentItem(items, 'c', 1)?.id).toBe('c');
    expect(adjacentItem([], undefined, 1)).toBeUndefined();
  });

  it('chooses a neighbour after deletion', () => {
    expect(neighbourItem(items, 'a')?.id).toBe('b');
    expect(neighbourItem(items, 'c')?.id).toBe('b');
    expect(neighbourItem(items, 'missing')).toBeUndefined();
  });
});
