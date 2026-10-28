import { type BookData, updateBookData } from '../storage/repository';
import type { DocId } from '../types';
import { mergeBookData, sameBookData } from './merge';

type MergedListener = (docId: DocId, data: BookData) => void;
const listeners = new Set<MergedListener>();

/**
 * Notifies `listener` when data from another device or a backup changed a
 * book's annotations or progress, so open views can refresh. Returns an
 * unsubscribe function.
 */
export function onBookDataMerged(listener: MergedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Merges `incoming` copies of a book's data into the library. Returns true if
 * anything on this device changed.
 */
export async function mergeIntoLibrary(docId: DocId, incoming: readonly BookData[]): Promise<boolean> {
  let changed = false;
  const result = await updateBookData(docId, (current) => {
    const merged = mergeBookData([current, ...incoming]);
    changed = !sameBookData(current, merged);
    return changed ? merged : null;
  });
  if (changed && result) for (const listener of listeners) listener(docId, result);
  return changed;
}
