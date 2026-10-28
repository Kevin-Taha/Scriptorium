import { describe, expect, it } from 'vitest';
import type { MarginNote, Tombstone } from '@/lib/types';
import { reconcileRecords } from './liveMerge';

const note = (id: string, updatedAt: number, text = id): MarginNote => ({
  id,
  docId: 'doc',
  page: 1,
  y: 0.5,
  text,
  color: 'amber',
  createdAt: 0,
  updatedAt,
});
const tombstone = (id: string, deletedAt: number): Tombstone => ({
  id,
  kind: 'note',
  docId: 'doc',
  deletedAt,
});
const version = (n: MarginNote) => n.updatedAt;

describe('reconcileRecords', () => {
  it('takes newer records from storage and adds records from elsewhere', () => {
    const local = [note('a', 1, 'old')];
    const result = reconcileRecords(local, [note('a', 2, 'new'), note('b', 3)], [], version);
    expect(result.map((n) => [n.id, n.text])).toEqual([
      ['a', 'new'],
      ['b', 'b'],
    ]);
  });

  it('keeps a local edit that is newer than storage (its save is still pending)', () => {
    const editing = note('a', 5, 'typing…');
    const result = reconcileRecords([editing], [note('a', 2, 'saved'), note('b', 3)], [], version);
    expect(result[0]).toBe(editing);
  });

  it('keeps a just-created local record that is not stored yet', () => {
    const created = note('new', 9);
    expect(reconcileRecords([created], [], [], version)).toEqual([created]);
  });

  it('drops a local record deleted elsewhere, unless it was edited after the deletion', () => {
    expect(reconcileRecords([note('a', 2)], [], [tombstone('a', 3)], version)).toEqual([]);
    const revived = note('a', 4);
    expect(reconcileRecords([revived], [], [tombstone('a', 3)], version)).toEqual([revived]);
  });

  it('returns the original array when nothing changed', () => {
    const local = [note('a', 1), note('b', 2)];
    const stored = [note('b', 2), note('a', 1)].map((n) => ({ ...n }));
    expect(reconcileRecords(local, stored, [], version)).toBe(local);
  });
});
