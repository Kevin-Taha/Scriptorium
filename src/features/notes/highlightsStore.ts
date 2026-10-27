import { useMemo } from 'react';
import { create } from 'zustand';
import { reportSaveError } from '@/app/reportSaveError';
import {
  deleteHighlight as deleteHighlightRecord,
  listHighlights,
  putHighlight,
} from '@/lib/storage/repository';
import type { DocId, Highlight, HighlightRect, NoteColor } from '@/lib/types';
import { createId } from '@/lib/util';
import { useReaderStore } from '../reader/readerStore';

export interface NewHighlightInput {
  page: number;
  rects: HighlightRect[];
  text: string;
  /** Defaults to the colour used last. */
  color?: NoteColor;
}

interface HighlightsState {
  docId: DocId | null;
  highlights: Highlight[];
  /** Colour of the most recent highlight, for `H` and the next selection. */
  lastColor: NoteColor;

  load(docId: DocId): Promise<void>;
  addHighlight(input: NewHighlightInput): Highlight;
  setColor(id: string, color: NoteColor): void;
  deleteHighlight(id: string): void;
  /** Puts back a deleted highlight under its original id (Undo). */
  restoreHighlight(highlight: Highlight): void;
}

const PERSIST_DELAY_MS = 300;
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

function savePut(highlight: Highlight): void {
  putHighlight(highlight).catch(reportSaveError);
}

function schedulePersist(id: string): void {
  const existing = pendingWrites.get(id);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    id,
    setTimeout(() => {
      pendingWrites.delete(id);
      const highlight = useHighlightsStore.getState().highlights.find((h) => h.id === id);
      if (highlight) savePut(highlight);
    }, PERSIST_DELAY_MS),
  );
}

/** Writes any pending highlight edits immediately. */
export function flushHighlights(): void {
  for (const [id, timer] of pendingWrites) {
    clearTimeout(timer);
    pendingWrites.delete(id);
    const highlight = useHighlightsStore.getState().highlights.find((h) => h.id === id);
    if (highlight) savePut(highlight);
  }
}

const firstLineTop = (h: Highlight) => h.rects[0]?.y ?? 0;
const byPosition = (a: Highlight, b: Highlight) =>
  a.page - b.page || firstLineTop(a) - firstLineTop(b) || a.createdAt - b.createdAt;

export const useHighlightsStore = create<HighlightsState>()((set, get) => ({
  docId: null,
  highlights: [],
  lastColor: 'amber',

  async load(docId) {
    flushHighlights();
    set({ docId, highlights: [] });
    const saved = await listHighlights(docId);
    if (get().docId !== docId) return;
    // Keep anything created while the saved highlights were loading.
    set((s) => {
      const ids = new Set(saved.map((h) => h.id));
      const latest = saved.reduce<Highlight | null>(
        (a, h) => (!a || h.updatedAt > a.updatedAt ? h : a),
        null,
      );
      return {
        highlights: [...saved, ...s.highlights.filter((h) => !ids.has(h.id))].sort(byPosition),
        // Pick up where the reader left off: the colour of the most recent highlight.
        lastColor: s.highlights.length > 0 ? s.lastColor : (latest?.color ?? s.lastColor),
      };
    });
  },

  addHighlight({ page, rects, text, color }) {
    const { docId, lastColor } = get();
    if (!docId) throw new Error('No document is open.');
    const now = Date.now();
    const highlight: Highlight = {
      id: createId(),
      docId,
      page,
      rects,
      text,
      color: color ?? lastColor,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ highlights: [...s.highlights, highlight].sort(byPosition), lastColor: highlight.color }));
    savePut(highlight);
    return highlight;
  },

  setColor(id, color) {
    set((s) => ({
      highlights: s.highlights.map((h) => (h.id === id ? { ...h, color, updatedAt: Date.now() } : h)),
      lastColor: color,
    }));
    schedulePersist(id);
  },

  deleteHighlight(id) {
    const timer = pendingWrites.get(id);
    if (timer) clearTimeout(timer);
    pendingWrites.delete(id);
    set((s) => ({ highlights: s.highlights.filter((h) => h.id !== id) }));
    deleteHighlightRecord(id).catch(reportSaveError);
  },

  restoreHighlight(highlight) {
    if (get().docId !== highlight.docId) return;
    set((s) => ({
      highlights: [...s.highlights.filter((h) => h.id !== highlight.id), highlight].sort(byPosition),
    }));
    savePut(highlight);
  },
}));

/** Highlights on a single page, top to bottom. */
export function useHighlightsForPage(page: number): Highlight[] {
  const highlights = useHighlightsStore((s) => s.highlights);
  return useMemo(() => highlights.filter((h) => h.page === page), [highlights, page]);
}

/** The highlight with this id, if it still exists. */
export function useHighlight(id: string | undefined): Highlight | undefined {
  return useHighlightsStore((s) => (id ? s.highlights.find((h) => h.id === id) : undefined));
}

useReaderStore.subscribe((state, prev) => {
  if (state.docId === prev.docId) return;
  if (state.docId) void useHighlightsStore.getState().load(state.docId);
  else {
    flushHighlights();
    useHighlightsStore.setState({ docId: null, highlights: [] });
  }
});

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushHighlights();
  });
  window.addEventListener('pagehide', flushHighlights);
}
