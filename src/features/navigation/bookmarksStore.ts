import { create } from 'zustand';
import { nextStamp } from '@/lib/sync/clock';
import { reportSaveError } from '@/app/reportSaveError';
import { sectionForPage } from '@/lib/pdf/outline';
import { deleteBookmark, listBookmarks, putBookmark } from '@/lib/storage/repository';
import { onBookDataMerged } from '@/lib/sync/apply';
import type { Bookmark, DocId } from '@/lib/types';
import { createId } from '@/lib/util';
import { useReaderStore } from '../reader/readerStore';
import { reconcileRecords } from '../sync/liveMerge';
import { pageLabelFor } from './pageLabels';

interface BookmarksState {
  docId: DocId | null;
  bookmarks: Bookmark[];
  /** False until the document's saved bookmarks are in memory; mutations wait for it. */
  loaded: boolean;
  load(docId: DocId): Promise<void>;
  /** Adds a bookmark for `page`, or removes it if one exists. Returns whether the page is now bookmarked. */
  toggle(page: number): boolean;
  rename(id: string, label: string): void;
  remove(id: string): void;
}

const byPage = (a: Bookmark, b: Bookmark) => a.page - b.page || a.createdAt - b.createdAt;

export const useBookmarksStore = create<BookmarksState>()((set, get) => ({
  docId: null,
  bookmarks: [],
  loaded: false,

  async load(docId) {
    set({ docId, bookmarks: [], loaded: false });
    const bookmarks = await listBookmarks(docId);
    if (get().docId === docId) set({ bookmarks, loaded: true });
  },

  toggle(page) {
    const { docId, bookmarks, loaded } = get();
    if (!docId || !loaded) return bookmarks.some((b) => b.page === page);
    const existing = bookmarks.find((b) => b.page === page);
    if (existing) {
      get().remove(existing.id);
      return false;
    }
    const reader = useReaderStore.getState();
    const section = sectionForPage(reader.outline, page);
    const bookmark: Bookmark = {
      id: createId(),
      docId,
      page,
      label: section ?? `Page ${pageLabelFor(reader.pageLabels, page)}`,
      createdAt: Date.now(),
    };
    set({ bookmarks: [...bookmarks, bookmark].sort(byPage) });
    putBookmark(bookmark).catch(reportSaveError);
    return true;
  },

  rename(id, label) {
    const bookmark = get().bookmarks.find((b) => b.id === id);
    if (!bookmark) return;
    const updated = {
      ...bookmark,
      label: label.trim() || `Page ${pageLabelFor(useReaderStore.getState().pageLabels, bookmark.page)}`,
      updatedAt: nextStamp(bookmark.updatedAt ?? bookmark.createdAt),
    };
    set((s) => ({ bookmarks: s.bookmarks.map((b) => (b.id === id ? updated : b)) }));
    putBookmark(updated).catch(reportSaveError);
  },

  remove(id) {
    if (!get().bookmarks.some((b) => b.id === id)) return;
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
    deleteBookmark(id).catch(reportSaveError);
  },
}));

/** Hook: whether `page` is bookmarked. */
export function useIsBookmarked(page: number): boolean {
  return useBookmarksStore((s) => s.bookmarks.some((b) => b.page === page));
}

useReaderStore.subscribe((state, prev) => {
  if (state.docId === prev.docId) return;
  if (state.docId) void useBookmarksStore.getState().load(state.docId);
  else useBookmarksStore.setState({ docId: null, bookmarks: [], loaded: false });
});

// Bookmarks merged in from another device or a backup appear on the open book.
onBookDataMerged((docId, data) => {
  const { docId: openId, bookmarks } = useBookmarksStore.getState();
  if (openId !== docId) return;
  const next = reconcileRecords(
    bookmarks,
    data.bookmarks,
    data.tombstones,
    (b) => b.updatedAt ?? b.createdAt,
  );
  if (next !== bookmarks) useBookmarksStore.setState({ bookmarks: [...next].sort(byPage) });
});
