import { navigate } from '@/app/router';
import { showToast } from '@/components/Toast';
import type { DocId, Highlight, MarginNote, OutlineItem } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore } from '../reader/readerStore';
import {
  describeAnnotations,
  exportFileName,
  exportableHighlights,
  exportableNotes,
  notesToMarkdown,
} from './exportMarkdown';
import { highlightAnchorY } from './highlightRects';
import { useHighlightUiStore } from './highlightUi';
import { useNoteFocusStore } from './noteFocus';

/** How far above a note's anchor the reader lands, so the note's passage has context above it. */
const JUMP_LEAD = 0.15;

/** Opens the reader at the top of `page`; the location left behind is recorded in navigation history. */
export function jumpToPage(docId: DocId, page: number): void {
  useHistoryStore.getState().jumpTo({ page, offset: 0 });
  navigate({ name: 'reader', docId });
}

/** Opens the reader at a note and briefly highlights it (and the passage it was written for) in the margin. */
export function jumpToNote(note: MarginNote): void {
  useHistoryStore.getState().jumpTo({ page: note.page, offset: Math.max(0, note.y - JUMP_LEAD) });
  useNoteFocusStore.getState().pulseNote(note.id);
  if (note.highlightId) useHighlightUiStore.getState().pulse(note.highlightId);
  navigate({ name: 'reader', docId: note.docId });
}

/** Opens the reader at a highlight and briefly flashes it. */
export function jumpToHighlightInBook(highlight: Highlight): void {
  useHistoryStore.getState().jumpTo({
    page: highlight.page,
    offset: Math.max(0, highlightAnchorY(highlight) - JUMP_LEAD),
  });
  useHighlightUiStore.getState().pulse(highlight.id);
  navigate({ name: 'reader', docId: highlight.docId });
}

function downloadTextFile(fileName: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads every note and highlight in the book (ignoring any review filters) as a Markdown file. */
export function exportNotesAsMarkdown(
  title: string,
  notes: MarginNote[],
  highlights: Highlight[],
  outline: OutlineItem[],
): void {
  const noteCount = exportableNotes(notes).length;
  const highlightCount = exportableHighlights(highlights).length;
  if (noteCount + highlightCount === 0) {
    showToast('There is nothing to export');
    return;
  }
  const pageLabels = useReaderStore.getState().pageLabels;
  const markdown = notesToMarkdown({ title, notes, highlights, outline, pageLabels, exportedAt: new Date() });
  downloadTextFile(exportFileName(title), markdown, 'text/markdown');
  showToast(`Exported ${describeAnnotations(noteCount, highlightCount)}`);
}
