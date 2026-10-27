import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { listHighlights, putHighlight } from '@/lib/storage/repository';
import type { Highlight, HighlightRect } from '@/lib/types';
import { useReaderStore } from '../reader/readerStore';
import { flushHighlights, useHighlight, useHighlightsForPage, useHighlightsStore } from './highlightsStore';

const DOC = 'doc-a';
const rects = (y: number): HighlightRect[] => [{ x: 0.1, y, w: 0.4, h: 0.02 }];

function saved(id: string, page: number, y: number, extra: Partial<Highlight> = {}): Highlight {
  return {
    id,
    docId: DOC,
    page,
    rects: rects(y),
    text: id,
    color: 'sky',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
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
  useHighlightsStore.setState({ docId: null, highlights: [], lastColor: 'amber' });
});

afterEach(async () => {
  flushHighlights();
  await settle();
  await resetDBForTests();
});

describe('highlightsStore', () => {
  it('refuses to add a highlight while no document is open', () => {
    expect(() =>
      useHighlightsStore.getState().addHighlight({ page: 1, rects: rects(0.1), text: 'x' }),
    ).toThrow();
  });

  it('adds highlights in reading order and persists them immediately', async () => {
    await openDocument();
    const { addHighlight } = useHighlightsStore.getState();
    addHighlight({ page: 2, rects: rects(0.5), text: 'later page' });
    addHighlight({ page: 1, rects: rects(0.8), text: 'low' });
    addHighlight({ page: 1, rects: rects(0.2), text: 'high' });

    expect(useHighlightsStore.getState().highlights.map((h) => h.text)).toEqual([
      'high',
      'low',
      'later page',
    ]);
    await vi.waitFor(async () => expect(await listHighlights(DOC)).toHaveLength(3));
  });

  it('uses the last colour by default and remembers explicit choices', async () => {
    await openDocument();
    const { addHighlight } = useHighlightsStore.getState();
    const first = addHighlight({ page: 1, rects: rects(0.1), text: 'a' });
    const second = addHighlight({ page: 1, rects: rects(0.3), text: 'b', color: 'rose' });
    const third = addHighlight({ page: 1, rects: rects(0.5), text: 'c' });

    expect(first.color).toBe('amber');
    expect(second.color).toBe('rose');
    expect(third.color).toBe('rose');
    expect(useHighlightsStore.getState().lastColor).toBe('rose');
  });

  it('recolours a highlight, persists it after the debounce, and remembers the colour', async () => {
    await openDocument();
    const created = useHighlightsStore.getState().addHighlight({ page: 1, rects: rects(0.1), text: 'a' });
    await vi.waitFor(async () => expect(await listHighlights(DOC)).toHaveLength(1));

    useHighlightsStore.getState().setColor(created.id, 'sage');
    useHighlightsStore.getState().setColor(created.id, 'lavender');
    expect(useHighlightsStore.getState().highlights[0].color).toBe('lavender');
    expect(useHighlightsStore.getState().lastColor).toBe('lavender');
    await vi.waitFor(async () => expect((await listHighlights(DOC))[0].color).toBe('lavender'), {
      timeout: 2000,
    });
  });

  it('flushes a pending recolour immediately', async () => {
    await openDocument();
    const created = useHighlightsStore.getState().addHighlight({ page: 1, rects: rects(0.1), text: 'a' });
    await vi.waitFor(async () => expect(await listHighlights(DOC)).toHaveLength(1));
    useHighlightsStore.getState().setColor(created.id, 'sky');
    flushHighlights();
    await vi.waitFor(async () => expect((await listHighlights(DOC))[0].color).toBe('sky'));
  });

  it('deletes a highlight and drops its pending write', async () => {
    await openDocument();
    const created = useHighlightsStore.getState().addHighlight({ page: 1, rects: rects(0.1), text: 'a' });
    await vi.waitFor(async () => expect(await listHighlights(DOC)).toHaveLength(1));
    useHighlightsStore.getState().setColor(created.id, 'rose');
    useHighlightsStore.getState().deleteHighlight(created.id);

    expect(useHighlightsStore.getState().highlights).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await listHighlights(DOC)).toEqual([]);
  });

  it('restores a deleted highlight under its original id', async () => {
    await openDocument();
    const created = useHighlightsStore.getState().addHighlight({ page: 3, rects: rects(0.4), text: 'keep' });
    useHighlightsStore.getState().deleteHighlight(created.id);
    await vi.waitFor(async () => expect(await listHighlights(DOC)).toEqual([]));

    useHighlightsStore.getState().restoreHighlight(created);
    expect(useHighlightsStore.getState().highlights).toEqual([created]);
    await vi.waitFor(async () => expect((await listHighlights(DOC)).map((h) => h.id)).toEqual([created.id]));
  });

  it('ignores a restore for another document', async () => {
    await openDocument();
    useHighlightsStore.getState().restoreHighlight(saved('x', 1, 0.1, { docId: 'other' }));
    expect(useHighlightsStore.getState().highlights).toEqual([]);
  });

  it('loads a document’s highlights when it opens, and resets when it changes or closes', async () => {
    await putHighlight(saved('h1', 2, 0.3));
    await putHighlight(saved('h2', 1, 0.7));
    await putHighlight(saved('other', 1, 0.1, { docId: 'doc-b' }));

    await openDocument(DOC);
    await vi.waitFor(() =>
      expect(useHighlightsStore.getState().highlights.map((h) => h.id)).toEqual(['h2', 'h1']),
    );

    await openDocument('doc-b');
    await vi.waitFor(() =>
      expect(useHighlightsStore.getState().highlights.map((h) => h.id)).toEqual(['other']),
    );

    useReaderStore.setState({ docId: null, status: 'idle' });
    expect(useHighlightsStore.getState().highlights).toEqual([]);
    expect(useHighlightsStore.getState().docId).toBeNull();
  });

  it('keeps a highlight made while the saved ones are still loading', async () => {
    await putHighlight(saved('old', 1, 0.5));
    useReaderStore.setState({ docId: DOC, status: 'ready' });
    const made = useHighlightsStore.getState().addHighlight({ page: 1, rects: rects(0.1), text: 'quick' });
    await vi.waitFor(() =>
      expect(useHighlightsStore.getState().highlights.map((h) => h.id)).toEqual([made.id, 'old']),
    );
  });

  it('picks up the colour of the most recent saved highlight as the colour to use next', async () => {
    await putHighlight(saved('older', 1, 0.2, { color: 'sage', updatedAt: 5 }));
    await putHighlight(saved('newest', 1, 0.6, { color: 'rose', updatedAt: 9 }));
    await openDocument();
    await vi.waitFor(() => expect(useHighlightsStore.getState().highlights).toHaveLength(2));
    expect(useHighlightsStore.getState().lastColor).toBe('rose');
  });

  it('keeps a colour chosen while the saved highlights were loading', async () => {
    await putHighlight(saved('old', 1, 0.5, { color: 'sage', updatedAt: 9 }));
    useReaderStore.setState({ docId: DOC, status: 'ready' });
    useHighlightsStore
      .getState()
      .addHighlight({ page: 1, rects: rects(0.1), text: 'quick', color: 'lavender' });
    await vi.waitFor(() => expect(useHighlightsStore.getState().highlights).toHaveLength(2));
    expect(useHighlightsStore.getState().lastColor).toBe('lavender');
  });

  it('survives a reload: highlights written before are read back', async () => {
    await openDocument();
    useHighlightsStore
      .getState()
      .addHighlight({ page: 4, rects: rects(0.25), text: 'remember', color: 'sky' });
    await vi.waitFor(async () => expect(await listHighlights(DOC)).toHaveLength(1));

    useHighlightsStore.setState({ docId: null, highlights: [] });
    useReaderStore.setState({ docId: null, status: 'idle' });
    await openDocument();
    await vi.waitFor(() =>
      expect(useHighlightsStore.getState().highlights).toMatchObject([
        { page: 4, text: 'remember', color: 'sky', rects: rects(0.25) },
      ]),
    );
  });
});

describe('highlight selectors', () => {
  it('useHighlightsForPage returns one page, top to bottom, and follows changes', async () => {
    await openDocument();
    const { addHighlight } = useHighlightsStore.getState();
    addHighlight({ page: 1, rects: rects(0.9), text: 'low' });
    addHighlight({ page: 2, rects: rects(0.1), text: 'elsewhere' });
    addHighlight({ page: 1, rects: rects(0.1), text: 'high' });

    const { result } = renderHook(() => useHighlightsForPage(1));
    expect(result.current.map((h) => h.text)).toEqual(['high', 'low']);

    act(() => {
      useHighlightsStore.getState().addHighlight({ page: 1, rects: rects(0.5), text: 'middle' });
    });
    expect(result.current.map((h) => h.text)).toEqual(['high', 'middle', 'low']);
  });

  it('useHighlight finds a highlight by id, and nothing for a missing or absent id', async () => {
    await openDocument();
    const created = useHighlightsStore.getState().addHighlight({ page: 1, rects: rects(0.1), text: 'a' });
    expect(renderHook(() => useHighlight(created.id)).result.current).toEqual(created);
    expect(renderHook(() => useHighlight('missing')).result.current).toBeUndefined();
    expect(renderHook(() => useHighlight(undefined)).result.current).toBeUndefined();
  });
});
