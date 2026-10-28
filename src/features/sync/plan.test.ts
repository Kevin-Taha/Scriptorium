import { describe, expect, it } from 'vitest';
import type { FolderFileRecord } from '@/lib/storage/db';
import type { LibraryDocument } from '@/lib/types';
import {
  changedFiles,
  comparePaths,
  groupPathsByHash,
  needsMetadata,
  planHashing,
  planLibrary,
  summarizeDevices,
} from './plan';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const file = (path: string, size = 100, lastModified = 1) => ({ path, size, lastModified });
const record = (path: string, hash: string, size = 100, lastModified = 1): FolderFileRecord => ({
  path,
  hash,
  size,
  lastModified,
});

const doc = (
  id: string,
  source?: LibraryDocument['source'],
  extra: Partial<LibraryDocument> = {},
): LibraryDocument => ({
  id,
  title: 'Book',
  fileName: 'Book.pdf',
  fileSize: 100,
  pageCount: 10,
  addedAt: 0,
  lastOpenedAt: 0,
  coverDataUrl: 'data:',
  source,
  ...extra,
});

describe('planHashing', () => {
  it('reuses cached hashes while size and time are unchanged', () => {
    const plan = planHashing(
      [file('a.pdf'), file('b.pdf', 200, 5)],
      [record('a.pdf', A), record('b.pdf', B, 200, 5)],
    );
    expect([...plan.known]).toEqual([
      ['a.pdf', A],
      ['b.pdf', B],
    ]);
    expect(plan.toHash).toEqual([]);
    expect(plan.moved).toEqual([]);
    expect(plan.stale).toEqual([]);
  });

  it('rehashes edited files and hashes new ones', () => {
    const plan = planHashing([file('a.pdf', 100, 2), file('new.pdf', 300, 9)], [record('a.pdf', A)]);
    expect(plan.known.size).toBe(0);
    expect(plan.toHash.map((f) => f.path)).toEqual(['a.pdf', 'new.pdf']);
  });

  it('follows a moved or renamed file without rehashing it', () => {
    const plan = planHashing([file('Physics/Mechanics.pdf', 100, 1)], [record('Mechanics.pdf', A, 100, 1)]);
    expect(plan.known.get('Physics/Mechanics.pdf')).toBe(A);
    expect(plan.moved).toEqual([record('Physics/Mechanics.pdf', A, 100, 1)]);
    expect(plan.stale).toEqual(['Mechanics.pdf']);
    expect(plan.toHash).toEqual([]);
  });

  it('rehashes when a move is ambiguous', () => {
    const twoVanished = planHashing([file('x.pdf')], [record('a.pdf', A), record('b.pdf', B)]);
    expect(twoVanished.toHash.map((f) => f.path)).toEqual(['x.pdf']);
    const twoArrived = planHashing([file('x.pdf'), file('y.pdf')], [record('a.pdf', A)]);
    expect(twoArrived.toHash.map((f) => f.path)).toEqual(['x.pdf', 'y.pdf']);
    expect(twoArrived.stale).toEqual(['a.pdf']);
  });
});

describe('planLibrary', () => {
  it('adds books that are new to the library', () => {
    const plan = planLibrary([], groupPathsByHash(new Map([['Mechanics.pdf', A]])));
    expect(plan.create).toEqual([{ id: A, path: 'Mechanics.pdf' }]);
    expect(plan.update).toEqual([]);
  });

  it('follows moved files and marks vanished ones missing', () => {
    const plan = planLibrary(
      [doc(A, { kind: 'folder', path: 'Old/Mechanics.pdf' }), doc(B, { kind: 'folder', path: 'Optics.pdf' })],
      groupPathsByHash(new Map([['New/Mechanics 2.pdf', A]])),
    );
    expect(plan.update).toEqual([
      { id: A, source: { kind: 'folder', path: 'New/Mechanics 2.pdf' }, fileName: 'Mechanics 2.pdf' },
      { id: B, source: { kind: 'folder', path: 'Optics.pdf', missing: true } },
    ]);
  });

  it('clears the missing flag when the file returns, and leaves settled books alone', () => {
    const plan = planLibrary(
      [
        doc(A, { kind: 'folder', path: 'Mechanics.pdf', missing: true }),
        doc(B, { kind: 'folder', path: 'Optics.pdf' }),
        doc(C, { kind: 'folder', path: 'Gone.pdf', missing: true }),
      ],
      groupPathsByHash(
        new Map([
          ['Mechanics.pdf', A],
          ['Optics.pdf', B],
        ]),
      ),
    );
    expect(plan.update).toEqual([
      { id: A, source: { kind: 'folder', path: 'Mechanics.pdf' }, fileName: 'Mechanics.pdf' },
    ]);
  });

  it('keeps a book on its current path when the folder holds several copies', () => {
    const paths = groupPathsByHash(
      new Map([
        ['Copy.pdf', A],
        ['Archive/Mechanics.pdf', A],
      ]),
    );
    expect(planLibrary([doc(A, { kind: 'folder', path: 'Archive/Mechanics.pdf' })], paths).update).toEqual(
      [],
    );
    expect(planLibrary([], paths).create).toEqual([{ id: A, path: 'Copy.pdf' }]);
  });

  it('leaves imported books alone even when the same PDF is in the folder', () => {
    const paths = groupPathsByHash(new Map([['Mechanics.pdf', A]]));
    expect(planLibrary([doc(A), doc(B, { kind: 'imported' })], paths)).toEqual({ create: [], update: [] });
  });
});

describe('helpers', () => {
  it('orders paths shallow first, then alphabetically', () => {
    expect(['b/a.pdf', 'z.pdf', 'a/b/c.pdf', 'a.pdf'].sort(comparePaths)).toEqual([
      'a.pdf',
      'z.pdf',
      'b/a.pdf',
      'a/b/c.pdf',
    ]);
  });

  it('finds files whose size or time changed since they were read', () => {
    const seen = new Map([
      ['a', { size: 1, lastModified: 1 }],
      ['b', { size: 1, lastModified: 1 }],
    ]);
    const files = [file('a', 1, 1), file('b', 2, 1), file('c', 1, 1)];
    expect(changedFiles(files, seen).map((f) => f.path)).toEqual(['b', 'c']);
  });

  it('lists other devices present in the folder, most recent first', () => {
    const known = new Map([
      ['me', { name: 'This one', lastWriteAt: 9 }],
      ['laptop', { name: 'Edge on Windows', lastWriteAt: 5 }],
      ['phone', { name: 'Chrome on Android', lastWriteAt: 7 }],
      ['gone', { name: 'Old tablet', lastWriteAt: 8 }],
    ]);
    expect(summarizeDevices(known, ['me', 'laptop', 'phone'], 'me')).toEqual([
      { id: 'phone', name: 'Chrome on Android', lastWriteAt: 7 },
      { id: 'laptop', name: 'Edge on Windows', lastWriteAt: 5 },
    ]);
  });

  it('reads details only for available folder books that lack them', () => {
    expect(needsMetadata(doc(A, { kind: 'folder', path: 'a.pdf' }, { pageCount: 0 }))).toBe(true);
    expect(needsMetadata(doc(A, { kind: 'folder', path: 'a.pdf' }, { coverDataUrl: undefined }))).toBe(true);
    expect(needsMetadata(doc(A, { kind: 'folder', path: 'a.pdf' }))).toBe(false);
    expect(needsMetadata(doc(A, { kind: 'folder', path: 'a.pdf', missing: true }, { pageCount: 0 }))).toBe(
      false,
    );
    expect(needsMetadata(doc(A, undefined, { pageCount: 0 }))).toBe(false);
  });
});
