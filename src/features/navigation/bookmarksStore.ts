import { create } from 'zustand';
import { sectionForPage } from '@/lib/pdf/outline';
import { deleteBookmark, listBookmarks, putBookmark } from '@/lib/storage/repository';
import type { Bookmark, DocId } from '@/lib/types';
import { createId } from '@/lib/util';
import { useReaderStore } from '../reader/readerStore';

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
    const section = sectionForPage(useReaderStore.getState().outline, page);
    const bookmark: Bookmark = {
      id: createId(),
      docId,
      page,
      label: section ?? `Page ${page}`,
      createdAt: Date.now(),
    };
    set({ bookmarks: [...bookmarks, bookmark].sort(byPage) });
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
    if (!get().bookmarks.some((b) => b.id === id)) return;
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
  else useBookmarksStore.setState({ docId: null, bookmarks: [], loaded: false });
});
