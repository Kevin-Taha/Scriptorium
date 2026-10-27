import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { listBookmarks, putBookmark } from '@/lib/storage/repository';
import { useReaderStore } from '../reader/readerStore';
import { useBookmarksStore } from './bookmarksStore';

beforeEach(async () => {
  useReaderStore.setState({ docId: null, status: 'idle', pageLabels: null });
  await resetDBForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

afterEach(() => {
  useReaderStore.setState({ docId: null, status: 'idle' });
});

describe('bookmarks', () => {
  it('auto-loads on document change, toggles, renames, removes and persists', async () => {
    await putBookmark({ id: 'existing', docId: 'd', page: 8, label: 'Existing', createdAt: 1 });
    useReaderStore.setState({
      docId: 'd',
      status: 'ready',
      outline: [{ title: 'Chapter 1', location: { page: 2, offset: 0 }, children: [] }],
    });
    await vi.waitFor(() => expect(useBookmarksStore.getState().bookmarks).toHaveLength(1));
    const store = useBookmarksStore.getState();
    expect(store.toggle(3)).toBe(true);
    expect(store.toggle(12)).toBe(true);
    expect(useBookmarksStore.getState().bookmarks.map((b) => [b.page, b.label])).toEqual([
      [3, 'Chapter 1'],
      [8, 'Existing'],
      [12, 'Chapter 1'],
    ]);
    const id = useBookmarksStore.getState().bookmarks[0].id;
    store.rename(id, '  My reference  ');
    store.remove('existing');
    expect(store.toggle(12)).toBe(false);
    await vi.waitFor(async () =>
      expect(await listBookmarks('d')).toMatchObject([{ id, page: 3, label: 'My reference' }]),
    );
    expect(useBookmarksStore.getState().bookmarks).toMatchObject([{ id, page: 3, label: 'My reference' }]);
    useReaderStore.setState({ docId: null });
    useReaderStore.setState({ docId: 'd' });
    await vi.waitFor(() =>
      expect(useBookmarksStore.getState().bookmarks).toMatchObject([{ page: 3, label: 'My reference' }]),
    );
  });

  it('falls back to a page label and trims empty rename', async () => {
    useReaderStore.setState({ docId: 'd', status: 'ready', outline: [] });
    await useBookmarksStore.getState().load('d');
    useBookmarksStore.getState().toggle(4);
    const bookmark = useBookmarksStore.getState().bookmarks[0];
    expect(bookmark.label).toBe('Page 4');
    useBookmarksStore.getState().rename(bookmark.id, '   ');
    expect(useBookmarksStore.getState().bookmarks[0].label).toBe('Page 4');
    await vi.waitFor(async () => expect(await listBookmarks('d')).toHaveLength(1));
  });

  it('uses printed labels for default and empty bookmark names, preserving outline names first', async () => {
    useReaderStore.setState({
      docId: 'd',
      status: 'ready',
      pageLabels: ['i', 'ii', '1'],
      outline: [{ title: 'Chapter', location: { page: 3, offset: 0 }, children: [] }],
    });
    await useBookmarksStore.getState().load('d');
    const store = useBookmarksStore.getState();
    store.toggle(2);
    store.toggle(3);
    const [front, chapter] = useBookmarksStore.getState().bookmarks;
    expect(front.label).toBe('Page ii');
    expect(chapter.label).toBe('Chapter');
    store.rename(chapter.id, ' ');
    expect(useBookmarksStore.getState().bookmarks[1].label).toBe('Page 1');
    await vi.waitFor(async () => expect(await listBookmarks('d')).toHaveLength(2));
  });

  it('ignores mutations until saved bookmarks have loaded', async () => {
    await putBookmark({ id: 'saved', docId: 'd', page: 7, label: 'Saved', createdAt: 1 });
    useReaderStore.setState({ docId: 'd', status: 'ready', outline: [] });
    expect(useBookmarksStore.getState().loaded).toBe(false);
    expect(useBookmarksStore.getState().toggle(7)).toBe(false);
    await vi.waitFor(() => expect(useBookmarksStore.getState().loaded).toBe(true));
    expect(useBookmarksStore.getState().bookmarks).toMatchObject([{ id: 'saved', page: 7 }]);
    expect(await listBookmarks('d')).toHaveLength(1);
  });
});
