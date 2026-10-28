import { stableStringify } from '@/lib/sync/merge';
import type { Tombstone } from '@/lib/types';

/**
 * Folds a book's freshly merged records (from another device or a backup)
 * into a store's in-memory list without disturbing local work:
 *
 * - a local record edited more recently than its stored copy is kept (its
 *   debounced save hasn't landed yet);
 * - a local record missing from storage is kept unless a tombstone at least as
 *   new says it was deleted (it was just created and is still being saved);
 * - unchanged records keep their identity, and if nothing changed at all the
 *   original array is returned, so React doesn't re-render.
 */
export function reconcileRecords<T extends { id: string }>(
  local: readonly T[],
  stored: readonly T[],
  tombstones: readonly Tombstone[],
  version: (record: T) => number,
): readonly T[] {
  const localById = new Map(local.map((record) => [record.id, record]));
  const deletedAt = new Map(tombstones.map((tombstone) => [tombstone.id, tombstone.deletedAt]));
  const result: T[] = [];
  const storedIds = new Set<string>();
  for (const record of stored) {
    storedIds.add(record.id);
    const mine = localById.get(record.id);
    if (mine && (version(mine) > version(record) || stableStringify(mine) === stableStringify(record))) {
      result.push(mine);
    } else {
      result.push(record);
    }
  }
  for (const mine of local) {
    if (storedIds.has(mine.id)) continue;
    const deleted = deletedAt.get(mine.id);
    if (deleted === undefined || deleted < version(mine)) result.push(mine);
  }
  const unchanged =
    result.length === local.length && result.every((record) => localById.get(record.id) === record);
  return unchanged ? local : result;
}
