import { useMemo } from 'react';
import { create } from 'zustand';
import { deleteNote as deleteNoteRecord, listNotes, putNote } from '@/lib/storage/repository';
import type { DocId, MarginNote, NoteColor } from '@/lib/types';
import { clamp, createId } from '@/lib/util';
import { useReaderStore } from '../reader/readerStore';

export interface NewNoteInput {
  page: number;
  y: number;
  quote?: string;
  color?: NoteColor;
  text?: string;
}

export type NotePatch = Partial<Pick<MarginNote, 'text' | 'color' | 'y' | 'quote'>>;

interface NotesState {
  docId: DocId | null;
  notes: MarginNote[];
  /** Note whose editor should be open and focused. */
  editingId: string | null;
  /** Colour applied to new notes; follows the most recent explicit choice. */
  lastColor: NoteColor;

  load(docId: DocId): Promise<void>;
  addNote(input: NewNoteInput): MarginNote;
  updateNote(id: string, patch: NotePatch): void;
  deleteNote(id: string): void;
  setEditing(id: string | null): void;
}

const PERSIST_DELAY_MS = 300;
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePersist(id: string): void {
  const existing = pendingWrites.get(id);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    id,
    setTimeout(() => {
      pendingWrites.delete(id);
      const note = useNotesStore.getState().notes.find((n) => n.id === id);
      if (note) void putNote(note);
    }, PERSIST_DELAY_MS),
  );
}

/** Writes any pending note edits immediately. */
export function flushNotes(): void {
  for (const [id, timer] of pendingWrites) {
    clearTimeout(timer);
    pendingWrites.delete(id);
    const note = useNotesStore.getState().notes.find((n) => n.id === id);
    if (note) void putNote(note);
  }
}

const byPosition = (a: MarginNote, b: MarginNote) =>
  a.page - b.page || a.y - b.y || a.createdAt - b.createdAt;

export const useNotesStore = create<NotesState>()((set, get) => ({
  docId: null,
  notes: [],
  editingId: null,
  lastColor: 'amber',

  async load(docId) {
    flushNotes();
    set({ docId, notes: [], editingId: null });
    const saved = await listNotes(docId);
    if (get().docId !== docId) return;
    // Keep any note created while the saved ones were loading.
    set((s) => {
      const ids = new Set(saved.map((n) => n.id));
      return { notes: [...saved, ...s.notes.filter((n) => !ids.has(n.id))].sort(byPosition) };
    });
  },

  addNote({ page, y, quote, color, text = '' }) {
    const { docId, lastColor } = get();
    if (!docId) throw new Error('No document is open.');
    const now = Date.now();
    const note: MarginNote = {
      id: createId(),
      docId,
      page,
      y: clamp(y, 0, 1),
      text,
      quote: quote?.trim() || undefined,
      color: color ?? lastColor,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ notes: [...s.notes, note].sort(byPosition), editingId: note.id }));
    void putNote(note);
    return note;
  },

  updateNote(id, patch) {
    set((s) => ({
      notes: s.notes
        .map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
        .sort(byPosition),
      lastColor: patch.color ?? s.lastColor,
    }));
    schedulePersist(id);
  },

  deleteNote(id) {
    const timer = pendingWrites.get(id);
    if (timer) clearTimeout(timer);
    pendingWrites.delete(id);
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      editingId: s.editingId === id ? null : s.editingId,
    }));
    void deleteNoteRecord(id);
  },

  setEditing: (editingId) => set({ editingId }),
}));

/** Notes on a single page, ordered top to bottom. */
export function useNotesForPage(page: number): MarginNote[] {
  const notes = useNotesStore((s) => s.notes);
  return useMemo(() => notes.filter((n) => n.page === page), [notes, page]);
}

/** Notes grouped by page, pages ascending — the shape used by the collated review. */
export function groupNotesByPage(notes: MarginNote[]): { page: number; notes: MarginNote[] }[] {
  const groups = new Map<number, MarginNote[]>();
  for (const note of [...notes].sort(byPosition)) {
    const list = groups.get(note.page);
    if (list) list.push(note);
    else groups.set(note.page, [note]);
  }
  return [...groups].map(([page, list]) => ({ page, notes: list }));
}

useReaderStore.subscribe((state, prev) => {
  if (state.docId === prev.docId) return;
  if (state.docId) void useNotesStore.getState().load(state.docId);
  else {
    flushNotes();
    useNotesStore.setState({ docId: null, notes: [], editingId: null });
  }
});

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNotes();
  });
  window.addEventListener('pagehide', flushNotes);
}
