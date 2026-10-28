import type { BookData } from '../storage/repository';
import type { Bookmark, Highlight, MarginNote, ReadingState, Tombstone } from '../types';

/**
 * Merging the annotations several devices hold for one book.
 *
 * Each record is identified by id; the copy edited most recently wins. A
 * deletion (tombstone) wins over any copy last edited at or before it, and is
 * dropped once a later edit revives the record. Reading progress is simply the
 * newest position. Merging is commutative, associative and idempotent, so
 * devices converge no matter in which order they see each other's data.
 */

type Versioned = { id: string };

/** JSON with object keys sorted, so equal data always serialises identically. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

function editedAt(record: MarginNote | Highlight | Bookmark): number {
  return 'updatedAt' in record && typeof record.updatedAt === 'number' ? record.updatedAt : record.createdAt;
}

/** Deterministic tie-break so every device picks the same copy of a record edited at the same instant. */
function pickNewer<T>(a: T, b: T, version: (record: T) => number): T {
  const diff = version(a) - version(b);
  if (diff !== 0) return diff > 0 ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

function mergeRecords<T extends Versioned>(
  lists: readonly (readonly T[])[],
  version: (record: T) => number,
  tombstones: ReadonlyMap<string, Tombstone>,
  revived: Set<string>,
): T[] {
  const latest = new Map<string, T>();
  for (const list of lists) {
    for (const record of list) {
      const current = latest.get(record.id);
      latest.set(record.id, current ? pickNewer(current, record, version) : record);
    }
  }
  const result: T[] = [];
  for (const record of latest.values()) {
    const tombstone = tombstones.get(record.id);
    if (tombstone && tombstone.deletedAt >= version(record)) continue;
    if (tombstone) revived.add(record.id);
    result.push(record);
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function mergeBookData(sets: readonly BookData[]): BookData {
  const tombstones = new Map<string, Tombstone>();
  for (const set of sets) {
    for (const tombstone of set.tombstones) {
      const current = tombstones.get(tombstone.id);
      tombstones.set(tombstone.id, current ? pickNewer(current, tombstone, (t) => t.deletedAt) : tombstone);
    }
  }

  const revived = new Set<string>();
  const notes = mergeRecords(
    sets.map((s) => s.notes),
    editedAt,
    tombstones,
    revived,
  );
  const highlights = mergeRecords(
    sets.map((s) => s.highlights),
    editedAt,
    tombstones,
    revived,
  );
  const bookmarks = mergeRecords(
    sets.map((s) => s.bookmarks),
    editedAt,
    tombstones,
    revived,
  );

  let progress: ReadingState | undefined;
  for (const set of sets) {
    if (!set.progress) continue;
    progress = progress ? pickNewer(progress, set.progress, (p) => p.updatedAt) : set.progress;
  }

  return {
    notes,
    highlights,
    bookmarks,
    tombstones: [...tombstones.values()]
      .filter((t) => !revived.has(t.id))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    progress,
  };
}

/** Canonical JSON for comparing book data regardless of record or key order. */
export function canonicalBookData(data: BookData): string {
  return stableStringify(mergeBookData([data]));
}

export function sameBookData(a: BookData, b: BookData): boolean {
  return canonicalBookData(a) === canonicalBookData(b);
}

export function isEmptyBookData(data: BookData): boolean {
  return (
    data.notes.length === 0 &&
    data.highlights.length === 0 &&
    data.bookmarks.length === 0 &&
    data.tombstones.length === 0 &&
    !data.progress
  );
}

export const EMPTY_BOOK_DATA: BookData = Object.freeze({
  notes: [],
  highlights: [],
  bookmarks: [],
  tombstones: [],
}) as BookData;
