import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '@/components/Toast';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { putBookmark, putHighlight, putNote, putReadingState } from '@/lib/storage/repository';
import type { BookData } from '@/lib/storage/repository';
import { mergeIntoLibrary } from '@/lib/sync/apply';
import { getDevice, resetDeviceForTests } from '@/lib/sync/device';
import type { Bookmark, Highlight, MarginNote, ReadingState } from '@/lib/types';
import { useBookmarksStore } from '../navigation/bookmarksStore';
import { useHistoryStore } from '../navigation/historyStore';
import { flushHighlights, useHighlightsStore } from '../notes/highlightsStore';
import { flushNotes, useNotesStore } from '../notes/notesStore';
import { useReaderStore } from '../reader/readerStore';
import { startProgressNotices } from './progressNotice';
import { useSyncStore } from './syncStore';

const DOC = 'doc-a';
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

const note = (id: string, updatedAt: number, text = id): MarginNote => ({
  id,
  docId: DOC,
  page: 2,
  y: 0.4,
  text,
  color: 'amber',
  createdAt: 1,
  updatedAt,
});
const highlight = (id: string, updatedAt: number): Highlight => ({
  id,
  docId: DOC,
  page: 2,
  rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }],
  text: id,
  color: 'sky',
  createdAt: 1,
  updatedAt,
});
const bookmark = (id: string, page: number): Bookmark => ({
  id,
  docId: DOC,
  page,
  label: `Page ${page}`,
  createdAt: 1,
});
const progress = (page: number, updatedAt: number, deviceId: string): ReadingState => ({
  docId: DOC,
  location: { page, offset: 0 },
  zoom: { mode: 'fit-width', scale: 1 },
  updatedAt,
  deviceId,
});
const remote = (data: Partial<BookData>): BookData => ({
  notes: [],
  highlights: [],
  bookmarks: [],
  tombstones: [],
  ...data,
});

async function openBook(): Promise<void> {
  useReaderStore.setState({
    docId: DOC,
    status: 'ready',
    location: { page: 1, offset: 0 },
    controller: null,
  });
  await settle();
}

let stopNotices: (() => void) | null = null;

beforeEach(async () => {
  await resetDBForTests();
  resetDeviceForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  await getDevice();
  useReaderStore.setState({ docId: null, status: 'idle', pageLabels: null });
  useToastStore.setState({ toasts: [] });
  useSyncStore.setState({ devices: [{ id: 'laptop', name: 'Edge on Windows', lastWriteAt: 1 }] });
});

afterEach(async () => {
  stopNotices?.();
  stopNotices = null;
  flushNotes();
  flushHighlights();
  useReaderStore.setState({ docId: null, status: 'idle' });
  await settle();
  await resetDBForTests();
});

describe('annotations merged from another device', () => {
  it('appear in the open book without interrupting the note being edited', async () => {
    await putNote(note('mine', 10, 'saved'));
    await openBook();
    useNotesStore.getState().setEditing('mine');
    useNotesStore.getState().updateNote('mine', { text: 'still typing' });
    const typed = useNotesStore.getState().notes.find((n) => n.id === 'mine')!;

    await mergeIntoLibrary(DOC, [
      remote({ notes: [note('mine', 11, 'older edit elsewhere'), note('theirs', 12)] }),
    ]);

    const { notes, editingId } = useNotesStore.getState();
    expect(notes.map((n) => n.text).sort()).toEqual(['still typing', 'theirs']);
    expect(notes.find((n) => n.id === 'mine')).toBe(typed);
    expect(editingId).toBe('mine');
  });

  it('remove notes, highlights and bookmarks deleted elsewhere', async () => {
    await putNote(note('n', 10));
    await putHighlight(highlight('h', 10));
    await putBookmark(bookmark('b', 4));
    await openBook();
    expect(useHighlightsStore.getState().highlights).toHaveLength(1);
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(1);

    await mergeIntoLibrary(DOC, [
      remote({
        tombstones: [
          { id: 'n', kind: 'note', docId: DOC, deletedAt: 20 },
          { id: 'h', kind: 'highlight', docId: DOC, deletedAt: 20 },
          { id: 'b', kind: 'bookmark', docId: DOC, deletedAt: 20 },
        ],
        bookmarks: [bookmark('b2', 9)],
        highlights: [highlight('h2', 15)],
      }),
    ]);

    expect(useNotesStore.getState().notes).toEqual([]);
    expect(useHighlightsStore.getState().highlights.map((h) => h.id)).toEqual(['h2']);
    expect(useBookmarksStore.getState().bookmarks.map((b) => b.id)).toEqual(['b2']);
  });

  it('leave other books’ open state alone', async () => {
    await openBook();
    const before = useNotesStore.getState().notes;
    await mergeIntoLibrary('doc-b', [remote({ notes: [{ ...note('x', 5), docId: 'doc-b' }] })]);
    expect(useNotesStore.getState().notes).toBe(before);
  });
});

describe('reading position from another device', () => {
  it('offers to go to a newer position instead of moving the page', async () => {
    stopNotices = startProgressNotices();
    await openBook();
    await mergeIntoLibrary(DOC, [remote({ progress: progress(142, Date.now(), 'laptop') })]);

    expect(useReaderStore.getState().location.page).toBe(1);
    const [toast] = useToastStore.getState().toasts;
    expect(toast.message).toBe('You were on p. 142 on Edge on Windows');
    expect(toast.action?.label).toBe('Go there');
    toast.action!.onAction();
    expect(useReaderStore.getState().location.page).toBe(142);
    expect(useHistoryStore.getState().returnTarget?.page).toBe(1);
  });

  it('stays quiet about this device’s own position', async () => {
    stopNotices = startProgressNotices();
    await openBook();
    await mergeIntoLibrary(DOC, [remote({ progress: progress(30, Date.now(), (await getDevice()).id) })]);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('says where the book was picked up when it was last read elsewhere', async () => {
    stopNotices = startProgressNotices();
    await putReadingState(progress(57, 100, 'laptop'));
    useReaderStore.setState({ docId: DOC, status: 'loading' });
    useReaderStore.setState({ status: 'ready', location: { page: 57, offset: 0 } });
    await settle();
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      'Picked up where you left off on Edge on Windows · p. 57',
    ]);
  });

  it('names an unknown device generically', async () => {
    stopNotices = startProgressNotices();
    useSyncStore.setState({ devices: [] });
    await putReadingState(progress(8, 100, 'tablet'));
    useReaderStore.setState({ docId: DOC, status: 'ready', location: { page: 8, offset: 0 } });
    await settle();
    expect(useToastStore.getState().toasts[0]?.message).toBe(
      'Picked up where you left off on another device · p. 8',
    );
  });
});
