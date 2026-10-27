import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToastStore } from '@/components/Toast';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { listNotes, putNote } from '@/lib/storage/repository';
import type { MarginNote } from '@/lib/types';
import { useReaderStore } from '../reader/readerStore';
import { deleteNoteWithUndo, isEmptyNote } from './noteActions';
import { flushNotes, groupNotesByPage, useNotesForPage, useNotesStore } from './notesStore';

const DOC = 'doc-a';

function note(id: string, page: number, y: number, extra: Partial<MarginNote> = {}): MarginNote {
  return { id, docId: DOC, page, y, text: id, color: 'amber', createdAt: 0, updatedAt: 0, ...extra };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

async function openDocument(docId = DOC) {
  useReaderStore.setState({ docId, status: 'ready' });
  await settle();
}

beforeEach(async () => {
  await resetDBForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  useReaderStore.setState({ docId: null, status: 'idle' });
  useNotesStore.setState({ docId: null, notes: [], editingId: null, lastColor: 'amber' });
  useToastStore.setState({ toasts: [] });
});

afterEach(async () => {
  flushNotes();
  await settle();
  await resetDBForTests();
});

describe('notesStore', () => {
  it('refuses to add a note while no document is open', () => {
    expect(() => useNotesStore.getState().addNote({ page: 1, y: 0.5 })).toThrow();
  });

  it('adds notes ordered by page then anchor, and opens the new one for editing', async () => {
    await openDocument();
    const { addNote } = useNotesStore.getState();
    addNote({ page: 2, y: 0.5 });
    addNote({ page: 1, y: 0.8 });
    const last = addNote({ page: 1, y: 0.2 });

    const { notes, editingId } = useNotesStore.getState();
    expect(notes.map((n) => [n.page, n.y])).toEqual([
      [1, 0.2],
      [1, 0.8],
      [2, 0.5],
    ]);
    expect(editingId).toBe(last.id);
  });

  it('clamps the anchor, trims the quote and defaults to amber', async () => {
    await openDocument();
    const high = useNotesStore.getState().addNote({ page: 1, y: 1.7, quote: '  a quoted line  ' });
    const low = useNotesStore.getState().addNote({ page: 1, y: -0.3, quote: '   ' });
    expect(high.y).toBe(1);
    expect(high.quote).toBe('a quoted line');
    expect(high.color).toBe('amber');
    expect(low.y).toBe(0);
    expect(low.quote).toBeUndefined();
  });

  it('applies the last explicit colour choice to new notes', async () => {
    await openDocument();
    const first = useNotesStore.getState().addNote({ page: 1, y: 0.1 });
    useNotesStore.getState().updateNote(first.id, { color: 'sage' });
    const second = useNotesStore.getState().addNote({ page: 1, y: 0.4 });
    const explicit = useNotesStore.getState().addNote({ page: 1, y: 0.6, color: 'rose' });
    expect(second.color).toBe('sage');
    expect(explicit.color).toBe('rose');
    expect(useNotesStore.getState().lastColor).toBe('sage');
  });

  it('updates text and colour, and re-sorts when the anchor changes', async () => {
    await openDocument();
    const a = useNotesStore.getState().addNote({ page: 1, y: 0.2 });
    const b = useNotesStore.getState().addNote({ page: 1, y: 0.4 });
    useNotesStore.getState().updateNote(a.id, { text: 'hello', y: 0.9 });
    const { notes } = useNotesStore.getState();
    expect(notes.map((n) => n.id)).toEqual([b.id, a.id]);
    expect(notes[1].text).toBe('hello');
    expect(notes[1].updatedAt).toBeGreaterThanOrEqual(a.updatedAt);
  });

  it('persists a new note immediately and edits after the debounce or a flush', async () => {
    await openDocument();
    const created = useNotesStore.getState().addNote({ page: 3, y: 0.5, quote: 'quoted' });
    await vi.waitFor(async () => expect(await listNotes(DOC)).toHaveLength(1));

    useNotesStore.getState().updateNote(created.id, { text: 'typed' });
    flushNotes();
    await vi.waitFor(async () => expect((await listNotes(DOC))[0].text).toBe('typed'));
    expect((await listNotes(DOC))[0]).toMatchObject({ page: 3, quote: 'quoted', y: 0.5 });
  });

  it('coalesces rapid edits into the latest text', async () => {
    await openDocument();
    const created = useNotesStore.getState().addNote({ page: 1, y: 0.5 });
    for (const text of ['h', 'he', 'hel', 'hello']) useNotesStore.getState().updateNote(created.id, { text });
    await vi.waitFor(async () => expect((await listNotes(DOC))[0]?.text).toBe('hello'), { timeout: 2000 });
  });

  it('deletes a note, clears editing for it, and drops its pending write', async () => {
    await openDocument();
    const created = useNotesStore.getState().addNote({ page: 1, y: 0.5 });
    await vi.waitFor(async () => expect(await listNotes(DOC)).toHaveLength(1));
    useNotesStore.getState().updateNote(created.id, { text: 'about to vanish' });
    useNotesStore.getState().deleteNote(created.id);

    expect(useNotesStore.getState().notes).toHaveLength(0);
    expect(useNotesStore.getState().editingId).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await listNotes(DOC)).toHaveLength(0);
  });

  it('keeps editing another note when a different one is deleted', async () => {
    await openDocument();
    const a = useNotesStore.getState().addNote({ page: 1, y: 0.2 });
    const b = useNotesStore.getState().addNote({ page: 1, y: 0.6 });
    useNotesStore.getState().deleteNote(a.id);
    expect(useNotesStore.getState().editingId).toBe(b.id);
  });

  it('loads a document’s notes when it opens, and resets when it changes or closes', async () => {
    await putNote(note('n1', 2, 0.3));
    await putNote(note('n2', 1, 0.7));
    await putNote(note('other', 1, 0.1, { docId: 'doc-b' }));

    await openDocument(DOC);
    await vi.waitFor(() => expect(useNotesStore.getState().notes.map((n) => n.id)).toEqual(['n2', 'n1']));

    useNotesStore.getState().setEditing('n1');
    await openDocument('doc-b');
    await vi.waitFor(() => expect(useNotesStore.getState().notes.map((n) => n.id)).toEqual(['other']));
    expect(useNotesStore.getState().editingId).toBeNull();

    useReaderStore.setState({ docId: null, status: 'idle' });
    expect(useNotesStore.getState().notes).toEqual([]);
    expect(useNotesStore.getState().docId).toBeNull();
  });

  it('survives a reload: notes written before are read back', async () => {
    await openDocument();
    useNotesStore.getState().addNote({ page: 4, y: 0.25, text: 'remember', color: 'sky' });
    await vi.waitFor(async () => expect(await listNotes(DOC)).toHaveLength(1));

    useNotesStore.setState({ docId: null, notes: [], editingId: null });
    useReaderStore.setState({ docId: null, status: 'idle' });
    await openDocument();
    await vi.waitFor(() =>
      expect(useNotesStore.getState().notes).toMatchObject([
        { page: 4, y: 0.25, text: 'remember', color: 'sky' },
      ]),
    );
  });
});

describe('note selectors', () => {
  it('useNotesForPage returns only that page, top to bottom', async () => {
    await openDocument();
    const { addNote } = useNotesStore.getState();
    addNote({ page: 1, y: 0.9, text: 'low' });
    addNote({ page: 2, y: 0.1, text: 'other page' });
    addNote({ page: 1, y: 0.1, text: 'high' });

    const { result } = renderHook(() => useNotesForPage(1));
    expect(result.current.map((n) => n.text)).toEqual(['high', 'low']);

    act(() => {
      useNotesStore.getState().addNote({ page: 1, y: 0.5, text: 'middle' });
    });
    expect(result.current.map((n) => n.text)).toEqual(['high', 'middle', 'low']);
  });

  it('groupNotesByPage groups ascending pages with notes in anchor order', () => {
    const groups = groupNotesByPage([note('c', 3, 0.5), note('b', 1, 0.8), note('a', 1, 0.2)]);
    expect(groups.map((g) => [g.page, g.notes.map((n) => n.id)])).toEqual([
      [1, ['a', 'b']],
      [3, ['c']],
    ]);
  });
});

describe('noteActions', () => {
  it('treats a note with neither text nor quote as empty', () => {
    expect(isEmptyNote({ text: '', quote: undefined })).toBe(true);
    expect(isEmptyNote({ text: '  \n ', quote: undefined })).toBe(true);
    expect(isEmptyNote({ text: '', quote: 'quoted' })).toBe(false);
    expect(isEmptyNote({ text: 'x', quote: undefined })).toBe(false);
  });

  it('deletes with an Undo toast that restores the note where it was', async () => {
    await openDocument();
    const original = useNotesStore
      .getState()
      .addNote({ page: 5, y: 0.42, quote: 'q', color: 'lavender', text: 'keep me' });
    useNotesStore.getState().setEditing(null);

    deleteNoteWithUndo(original);
    expect(useNotesStore.getState().notes).toHaveLength(0);
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.message).toBe('Note deleted');
    expect(toast?.action?.label).toBe('Undo');

    toast!.action!.onAction();
    const [restored] = useNotesStore.getState().notes;
    expect(restored).toMatchObject({ page: 5, y: 0.42, quote: 'q', color: 'lavender', text: 'keep me' });
    expect(useNotesStore.getState().editingId).toBeNull();
    await vi.waitFor(async () => expect(await listNotes(DOC)).toHaveLength(1));
  });

  it('Undo keeps a note linked to its highlight', async () => {
    await openDocument();
    const original = useNotesStore
      .getState()
      .addNote({ page: 5, y: 0.42, quote: 'q', text: 'on a highlight', highlightId: 'h1' });
    useNotesStore.getState().setEditing(null);

    deleteNoteWithUndo(original);
    useToastStore.getState().toasts.at(-1)!.action!.onAction();

    expect(useNotesStore.getState().notes[0]).toMatchObject({ highlightId: 'h1', text: 'on a highlight' });
  });
});

describe('note highlight links', () => {
  it('stores the highlight a note was written for and persists it', async () => {
    await openDocument();
    const created = useNotesStore.getState().addNote({ page: 2, y: 0.3, quote: 'q', highlightId: 'h1' });
    expect(created.highlightId).toBe('h1');
    await vi.waitFor(async () => expect((await listNotes(DOC))[0].highlightId).toBe('h1'));
  });

  it('unlinks a note with an update and persists the change', async () => {
    await openDocument();
    const created = useNotesStore.getState().addNote({ page: 2, y: 0.3, quote: 'q', highlightId: 'h1' });
    useNotesStore.getState().updateNote(created.id, { highlightId: undefined });
    flushNotes();
    expect(useNotesStore.getState().notes[0].highlightId).toBeUndefined();
    await vi.waitFor(async () => expect((await listNotes(DOC))[0].highlightId).toBeUndefined());
  });
});
