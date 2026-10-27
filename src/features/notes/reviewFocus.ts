const NOTE_SELECTOR = '.review-note';

function visibleNotes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(NOTE_SELECTOR)];
}

/** Moves focus to the next (or previous) visible note; the first press lands on the first note. */
export function focusAdjacentNote(direction: 1 | -1): void {
  const notes = visibleNotes();
  if (notes.length === 0) return;
  const current = document.activeElement?.closest<HTMLElement>(NOTE_SELECTOR);
  const index = current ? notes.indexOf(current) + direction : direction === 1 ? 0 : notes.length - 1;
  const target = notes[Math.min(notes.length - 1, Math.max(0, index))];
  target.focus();
  target.scrollIntoView({ block: 'nearest' });
}

export function focusNoteById(noteId: string | undefined): void {
  if (!noteId) return;
  document.querySelector<HTMLElement>(`${NOTE_SELECTOR}[data-note-id="${CSS.escape(noteId)}"]`)?.focus();
}

/** The id of the note after (or, failing that, before) `noteId` in the current list. */
export function neighbourNoteId(noteId: string): string | undefined {
  const notes = visibleNotes();
  const index = notes.findIndex((element) => element.dataset.noteId === noteId);
  return (notes[index + 1] ?? notes[index - 1])?.dataset.noteId;
}
