import { showToast } from '@/components/Toast';
import type { MarginNote } from '@/lib/types';
import { useNotesStore } from './notesStore';

/** Deletes a note and offers a toast that brings it back where it was. */
export function deleteNoteWithUndo(note: MarginNote): void {
  const { deleteNote, addNote, setEditing } = useNotesStore.getState();
  deleteNote(note.id);
  showToast('Note deleted', {
    action: {
      label: 'Undo',
      onAction() {
        // The reader may have moved on to another book (or the library) since the deletion.
        if (useNotesStore.getState().docId !== note.docId) return;
        addNote({
          page: note.page,
          y: note.y,
          quote: note.quote,
          color: note.color,
          text: note.text,
          highlightId: note.highlightId,
        });
        setEditing(null);
      },
    },
  });
}

/** True when a note carries nothing worth keeping. */
export function isEmptyNote(note: Pick<MarginNote, 'text' | 'quote'>): boolean {
  return !note.text.trim() && !note.quote;
}
