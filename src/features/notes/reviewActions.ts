import { navigate } from '@/app/router';
import { showToast } from '@/components/Toast';
import type { DocId, MarginNote, OutlineItem } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore } from '../reader/readerStore';
import { exportFileName, exportableNotes, notesToMarkdown } from './exportMarkdown';
import { useNoteFocusStore } from './noteFocus';

/** How far above a note's anchor the reader lands, so the note's passage has context above it. */
const JUMP_LEAD = 0.15;

/** Opens the reader at the top of `page`; the location left behind is recorded in navigation history. */
export function jumpToPage(docId: DocId, page: number): void {
  useHistoryStore.getState().jumpTo({ page, offset: 0 });
  navigate({ name: 'reader', docId });
}

/** Opens the reader at a note and briefly highlights it in the margin. */
export function jumpToNote(note: MarginNote): void {
  useHistoryStore.getState().jumpTo({ page: note.page, offset: Math.max(0, note.y - JUMP_LEAD) });
  useNoteFocusStore.getState().pulseNote(note.id);
  navigate({ name: 'reader', docId: note.docId });
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

/** Downloads every note in the book (ignoring any review filters) as a Markdown file. */
export function exportNotesAsMarkdown(title: string, notes: MarginNote[], outline: OutlineItem[]): void {
  const count = exportableNotes(notes).length;
  if (count === 0) {
    showToast('There are no notes to export');
    return;
  }
  const pageLabels = useReaderStore.getState().pageLabels;
  const markdown = notesToMarkdown({ title, notes, outline, pageLabels, exportedAt: new Date() });
  downloadTextFile(exportFileName(title), markdown, 'text/markdown');
  showToast(`Exported ${count} ${count === 1 ? 'note' : 'notes'}`);
}
