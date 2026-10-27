import { create } from 'zustand';
import { sectionForPage } from '@/lib/pdf/outline';
import { deleteBookmark, listBookmarks, putBookmark } from '@/lib/storage/repository';
import type { Bookmark, DocId } from '@/lib/types';
import { createId } from '@/lib/util';
import { useReaderStore } from '../reader/readerStore';

interface BookmarksState {
  docId: DocId | null;
  bookmarks: Bookmark[];
  load(docId: DocId): Promise<void>;
  /** Adds a bookmark for `page`, or removes it if one exists. Returns the new state. */
  toggle(page: number): boolean;
  rename(id: string, label: string): void;
  remove(id: string): void;
}

export const useBookmarksStore = create<BookmarksState>()((set, get) => ({
  docId: null,
  bookmarks: [],

  async load(docId) {
    set({ docId, bookmarks: [] });
    const bookmarks = await listBookmarks(docId);
    if (get().docId === docId) set({ bookmarks });
  },

  toggle(page) {
    const { docId, bookmarks } = get();
    if (!docId) return false;
    const existing = bookmarks.find((b) => b.page === page);
    if (existing) {
      get().remove(existing.id);
      return false;
    }
    const section = sectionForPage(useReaderStore.getState().outline, page);
    const bookmark: Bookmark = {
      id: createId(),
      docId,
      page,
      label: section ?? `Page ${page}`,
      createdAt: Date.now(),
    };
    set({ bookmarks: [...bookmarks, bookmark].sort((a, b) => a.page - b.page) });
    void putBookmark(bookmark);
    return true;
  },

  rename(id, label) {
    const bookmark = get().bookmarks.find((b) => b.id === id);
    if (!bookmark) return;
    const updated = { ...bookmark, label: label.trim() || `Page ${bookmark.page}` };
    set((s) => ({ bookmarks: s.bookmarks.map((b) => (b.id === id ? updated : b)) }));
    void putBookmark(updated);
  },

  remove(id) {
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
    void deleteBookmark(id);
  },
}));

/** Hook: whether `page` is bookmarked. */
export function useIsBookmarked(page: number): boolean {
  return useBookmarksStore((s) => s.bookmarks.some((b) => b.page === page));
}

useReaderStore.subscribe((state, prev) => {
  if (state.docId === prev.docId) return;
  if (state.docId) void useBookmarksStore.getState().load(state.docId);
  else useBookmarksStore.setState({ docId: null, bookmarks: [] });
});
