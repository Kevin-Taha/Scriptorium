import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '@/components/Toast';
import type { Highlight } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore } from '../reader/readerStore';
import {
  addNoteForHighlight,
  deleteHighlightWithUndo,
  highlightSelection,
  jumpToHighlight,
} from './highlightActions';
import { useHighlightUiStore } from './highlightUi';
import { useHighlightsStore } from './highlightsStore';
import { useNoteFocusStore } from './noteFocus';
import { useNotesStore } from './notesStore';

const DOC = 'doc';

function reset(docId: string | null) {
  useReaderStore.setState({
    docId: null,
    status: 'idle',
    location: { page: 1, offset: 0 },
    controller: null,
  });
  useHistoryStore.getState().reset();
  useHighlightsStore.setState({ docId, highlights: [], lastColor: 'amber' });
  useNotesStore.setState({ docId, notes: [], editingId: null, lastColor: 'amber' });
  useHighlightUiStore.setState({ activeId: null, anchor: null, pulsingId: null, hoverId: null });
  useNoteFocusStore.getState().clearPulse();
  useToastStore.setState({ toasts: [] });
}

beforeEach(() => reset(DOC));
afterEach(() => {
  reset(null);
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

function addHighlight(overrides: Partial<Highlight> = {}): Highlight {
  const created = useHighlightsStore.getState().addHighlight({
    page: 4,
    rects: [
      { x: 0.1, y: 0.3, w: 0.5, h: 0.02 },
      { x: 0.1, y: 0.32, w: 0.3, h: 0.02 },
    ],
    text: 'The highlighted passage',
    color: 'sage',
  });
  return { ...created, ...overrides };
}

describe('addNoteForHighlight', () => {
  it('creates an editing note anchored at the highlight, quoting it, in its colour and linked to it', () => {
    const highlight = addHighlight();
    addNoteForHighlight(highlight);

    const { notes, editingId } = useNotesStore.getState();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      page: 4,
      quote: 'The highlighted passage',
      color: 'sage',
      highlightId: highlight.id,
      text: '',
    });
    expect(notes[0].y).toBeCloseTo(0.31);
    expect(editingId).toBe(notes[0].id);
  });

  it('opens the existing note instead of making a second one', () => {
    const highlight = addHighlight();
    addNoteForHighlight(highlight);
    const [note] = useNotesStore.getState().notes;
    useNotesStore.getState().setEditing(null);

    addNoteForHighlight(highlight);

    expect(useNotesStore.getState().notes).toHaveLength(1);
    expect(useNotesStore.getState().editingId).toBe(note.id);
    expect(useNoteFocusStore.getState().pulsingId).toBe(note.id);
  });

  it('keeps the passage’s wording within the quote limit', () => {
    const highlight = addHighlight({ text: 'word '.repeat(300) });
    addNoteForHighlight(highlight);
    const quote = useNotesStore.getState().notes[0].quote!;
    expect(quote.length).toBeLessThanOrEqual(600);
    expect(quote.endsWith('…')).toBe(true);
  });
});

describe('deleteHighlightWithUndo', () => {
  it('removes the highlight, keeps its note and unlinks it', () => {
    const highlight = addHighlight();
    addNoteForHighlight(highlight);
    useNotesStore.getState().setEditing(null);

    deleteHighlightWithUndo(highlight);

    expect(useHighlightsStore.getState().highlights).toEqual([]);
    const [note] = useNotesStore.getState().notes;
    expect(note.highlightId).toBeUndefined();
    expect(note.quote).toBe('The highlighted passage');
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ message: 'Highlight deleted' });
  });

  it('Undo brings back the highlight under its id and re-links the note', () => {
    const highlight = addHighlight();
    addNoteForHighlight(highlight);
    useNotesStore.getState().setEditing(null);
    deleteHighlightWithUndo(highlight);

    useToastStore.getState().toasts.at(-1)!.action!.onAction();

    expect(useHighlightsStore.getState().highlights.map((h) => h.id)).toEqual([highlight.id]);
    expect(useNotesStore.getState().notes[0].highlightId).toBe(highlight.id);
  });

  it('Undo does not re-link a note that was deleted in the meantime', () => {
    const highlight = addHighlight();
    addNoteForHighlight(highlight);
    const [note] = useNotesStore.getState().notes;
    deleteHighlightWithUndo(highlight);
    useNotesStore.getState().deleteNote(note.id);

    useToastStore.getState().toasts.at(-1)!.action!.onAction();

    expect(useNotesStore.getState().notes).toEqual([]);
    expect(useHighlightsStore.getState().highlights).toHaveLength(1);
  });

  it('closes the popover that was open for the highlight', () => {
    const highlight = addHighlight();
    useHighlightUiStore.getState().openPopover(highlight.id, { x: 10, top: 10, bottom: 20 });
    deleteHighlightWithUndo(highlight);
    expect(useHighlightUiStore.getState().activeId).toBeNull();
  });

  it('Undo does nothing once another book is open', () => {
    const highlight = addHighlight();
    deleteHighlightWithUndo(highlight);
    useHighlightsStore.setState({ docId: 'other-book' });

    useToastStore.getState().toasts.at(-1)!.action!.onAction();

    expect(useHighlightsStore.getState().highlights).toEqual([]);
  });
});

describe('jumpToHighlight', () => {
  it('jumps above the highlight (recorded in history) and flashes it', () => {
    const highlight = addHighlight();
    jumpToHighlight(highlight);

    const { location } = useReaderStore.getState();
    expect(location.page).toBe(4);
    expect(location.offset).toBeCloseTo(0.31 - 0.15);
    expect(useHistoryStore.getState().back).toHaveLength(1);
    expect(useHighlightUiStore.getState().pulsingId).toBe(highlight.id);
  });

  it('never scrolls above the top of the page', () => {
    const created = useHighlightsStore.getState().addHighlight({
      page: 2,
      rects: [{ x: 0.1, y: 0.02, w: 0.5, h: 0.02 }],
      text: 'near the top',
    });
    jumpToHighlight(created);
    expect(useReaderStore.getState().location).toEqual({ page: 2, offset: 0 });
  });
});

describe('highlightSelection', () => {
  function rect(top: number, left: number, width: number, height: number): DOMRect {
    return {
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    };
  }

  function selectText(rects: DOMRect[]) {
    document.body.innerHTML = `
      <div class="page-sheet" data-page="6"><div class="textLayer"><span id="a">Margins were not empty</span></div></div>`;
    document.querySelector<HTMLElement>('.page-sheet')!.getBoundingClientRect = () => rect(100, 50, 600, 800);
    Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => rects[0];
    const text = document.getElementById('a')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 7);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  it('highlights the selection in the given colour and clears the selection', () => {
    selectText([rect(300, 70, 120, 20)]);

    expect(highlightSelection('rose')).toBe(true);

    const [created] = useHighlightsStore.getState().highlights;
    expect(created).toMatchObject({ page: 6, color: 'rose', text: 'Margins' });
    expect(created.rects).toEqual([{ x: 0.03333, y: 0.25, w: 0.2, h: 0.025 }]);
    expect(window.getSelection()!.toString()).toBe('');
    expect(useHighlightsStore.getState().lastColor).toBe('rose');
  });

  it('uses the last colour when none is given', () => {
    useHighlightsStore.setState({ lastColor: 'lavender' });
    selectText([rect(300, 70, 120, 20)]);
    highlightSelection();
    expect(useHighlightsStore.getState().highlights[0].color).toBe('lavender');
  });

  it('does nothing without a usable selection, a document, or any text rectangles', () => {
    expect(highlightSelection()).toBe(false);

    selectText([rect(100, 50, 600, 800)]); // only the end-of-content sentinel
    expect(highlightSelection()).toBe(false);

    selectText([rect(300, 70, 120, 20)]);
    useHighlightsStore.setState({ docId: null });
    expect(highlightSelection()).toBe(false);
    expect(useHighlightsStore.getState().highlights).toEqual([]);
  });
});
