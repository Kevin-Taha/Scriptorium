import { showToast } from '@/components/Toast';
import type { Highlight, NoteColor } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { highlightAnchorY } from './highlightRects';
import { useHighlightUiStore } from './highlightUi';
import { useHighlightsStore } from './highlightsStore';
import { useNoteFocusStore } from './noteFocus';
import { useNotesStore } from './notesStore';
import { normalizeQuote, readPageSelection } from './selectionNote';

/** How far above a highlight the reader lands, so there is context above it. */
const JUMP_LEAD = 0.15;

/**
 * Highlights the current page selection (in `color`, or the colour used last)
 * and clears the selection. Returns false, creating nothing, when there is no
 * usable selection.
 */
export function highlightSelection(color?: NoteColor): boolean {
  const { docId, addHighlight } = useHighlightsStore.getState();
  if (!docId) return false;
  const selection = readPageSelection();
  if (!selection || selection.rects.length === 0) return false;
  addHighlight({ page: selection.page, rects: selection.rects, text: selection.text, color });
  window.getSelection()?.removeAllRanges();
  return true;
}

/**
 * Opens the margin note written for a highlight, creating it (anchored at the
 * highlight, quoting its text, in its colour) if there is none yet.
 */
export function addNoteForHighlight(highlight: Highlight): void {
  const { notes, addNote, setEditing } = useNotesStore.getState();
  const existing = notes.find((note) => note.highlightId === highlight.id);
  if (existing) {
    setEditing(existing.id);
    useNoteFocusStore.getState().pulseNote(existing.id);
    return;
  }
  addNote({
    page: highlight.page,
    y: highlightAnchorY(highlight),
    quote: normalizeQuote(highlight.text),
    color: highlight.color,
    highlightId: highlight.id,
  });
}

/**
 * Deletes a highlight with an Undo toast. Notes written for it are kept and
 * unlinked; Undo restores the highlight and re-links them.
 */
export function deleteHighlightWithUndo(highlight: Highlight): void {
  const linkedIds = useNotesStore
    .getState()
    .notes.filter((note) => note.highlightId === highlight.id)
    .map((note) => note.id);

  useHighlightsStore.getState().deleteHighlight(highlight.id);
  for (const id of linkedIds) useNotesStore.getState().updateNote(id, { highlightId: undefined });
  const ui = useHighlightUiStore.getState();
  if (ui.activeId === highlight.id) ui.closePopover();

  showToast('Highlight deleted', {
    action: {
      label: 'Undo',
      onAction() {
        // The reader may have moved on to another book since the deletion.
        if (useHighlightsStore.getState().docId !== highlight.docId) return;
        useHighlightsStore.getState().restoreHighlight(highlight);
        const { notes, updateNote } = useNotesStore.getState();
        for (const id of linkedIds)
          if (notes.some((note) => note.id === id)) updateNote(id, { highlightId: highlight.id });
      },
    },
  });
}

/** Scrolls the reader to a highlight (recorded in navigation history) and flashes it. */
export function jumpToHighlight(highlight: Highlight): void {
  useHistoryStore.getState().jumpTo({
    page: highlight.page,
    offset: Math.max(0, highlightAnchorY(highlight) - JUMP_LEAD),
  });
  useHighlightUiStore.getState().pulse(highlight.id);
}
