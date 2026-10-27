const NOTE_SELECTOR = '.review-note';

function visibleNotes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(NOTE_SELECTOR)];
}

/** Rows are notes and highlights; each carries one of the two id attributes. */
function rowId(element: HTMLElement): string | undefined {
  return element.dataset.noteId ?? element.dataset.highlightId;
}

/** Moves focus to the next (or previous) visible note or highlight; the first press lands on the first row. */
export function focusAdjacentNote(direction: 1 | -1): void {
  const notes = visibleNotes();
  if (notes.length === 0) return;
  const current = document.activeElement?.closest<HTMLElement>(NOTE_SELECTOR);
  const index = current ? notes.indexOf(current) + direction : direction === 1 ? 0 : notes.length - 1;
  const target = notes[Math.min(notes.length - 1, Math.max(0, index))];
  target.focus();
  target.scrollIntoView({ block: 'nearest' });
}

/** Focuses the note or highlight row with this id. */
export function focusNoteById(id: string | undefined): void {
  if (!id) return;
  const escaped = CSS.escape(id);
  document
    .querySelector<HTMLElement>(
      `${NOTE_SELECTOR}[data-note-id="${escaped}"], ${NOTE_SELECTOR}[data-highlight-id="${escaped}"]`,
    )
    ?.focus();
}

/** The id of the row after (or, failing that, before) `id` in the current list. */
export function neighbourNoteId(id: string): string | undefined {
  const notes = visibleNotes();
  const index = notes.findIndex((element) => rowId(element) === id);
  const neighbour = notes[index + 1] ?? notes[index - 1];
  return neighbour && rowId(neighbour);
}
