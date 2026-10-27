import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import type { MarginNote } from '@/lib/types';
import { deleteNoteWithUndo } from './noteActions';
import { NOTE_COLOR_LABELS } from './noteColors';
import { NoteSwatches } from './NoteSwatches';
import { useNotesStore } from './notesStore';
import { jumpToNote } from './reviewActions';
import { highlightSegments } from './reviewFilter';
import { focusNoteById, neighbourNoteId } from './reviewFocus';

interface ReviewNoteProps {
  note: MarginNote;
  editing: boolean;
  /** Folded search words to highlight in the note's text and quote. */
  terms: string[];
  onEdit(id: string | null): void;
  onActive(id: string | null): void;
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const segments = useMemo(() => highlightSegments(text, terms), [text, terms]);
  return segments.map((segment, i) =>
    segment.match ? (
      <mark key={i} className="review-mark">
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  );
}

/** One note in the review: click or press Enter to edit in place; edits save as you type. */
export const ReviewNote = memo(function ReviewNote({
  note,
  editing,
  terms,
  onEdit,
  onActive,
}: ReviewNoteProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (editing || (event.target as Element).closest('button')) return;
    if (window.getSelection()?.toString()) return; // the reader is selecting text, not asking to edit
    onEdit(note.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.key !== 'Enter') return;
    event.preventDefault();
    onEdit(note.id);
  };

  // Keep focus in the editor when pressing anywhere else in the note (swatches, padding).
  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (editing && !(event.target as Element).closest('textarea')) event.preventDefault();
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    onActive(null);
    if (editing) onEdit(null);
  };

  const classes = ['review-note', editing && 'is-editing', note.quote && 'review-note--quoted']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={classes}
      data-note-id={note.id}
      data-note-color={note.color}
      role="group"
      aria-label={`${NOTE_COLOR_LABELS[note.color]} note on page ${note.page}`}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => onActive(note.id)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(note.id)}
      onBlur={handleBlur}
    >
      <span className="review-note__dot" aria-hidden="true" />
      <div className="review-note__main">
        {note.quote && (
          <blockquote className="review-note__quote">
            <Highlighted text={note.quote} terms={terms} />
          </blockquote>
        )}
        {editing ? (
          <NoteEditor note={note} rootRef={rootRef} onEdit={onEdit} />
        ) : (
          <p className={`review-note__text${note.text.trim() ? '' : ' is-empty'}`}>
            {note.text.trim() ? <Highlighted text={note.text} terms={terms} /> : 'Empty note'}
          </p>
        )}
      </div>
      {!editing && (
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm review-note__jump review-tooltip-end tooltip tooltip--below"
          data-tooltip="Show in book"
          aria-label={`Show note on page ${note.page} in the book`}
          onClick={() => jumpToNote(note)}
        >
          <ArrowUpRight />
        </button>
      )}
    </div>
  );
});

interface NoteEditorProps {
  note: MarginNote;
  rootRef: RefObject<HTMLDivElement | null>;
  onEdit(id: string | null): void;
}

function NoteEditor({ note, rootRef, onEdit }: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current!;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current!;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [note.text]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onEdit(null);
    rootRef.current?.focus();
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    // A keyboard-triggered click has no pointer position; keep keyboard users in the list.
    const neighbour = event.detail === 0 ? neighbourNoteId(note.id) : undefined;
    onEdit(null);
    deleteNoteWithUndo(note);
    requestAnimationFrame(() => focusNoteById(neighbour));
  };

  return (
    <>
      <textarea
        ref={textareaRef}
        className="review-note__input"
        rows={1}
        value={note.text}
        placeholder="Write a note…"
        aria-label={`Note text, page ${note.page}`}
        onChange={(event) => useNotesStore.getState().updateNote(note.id, { text: event.target.value })}
        onKeyDown={handleKeyDown}
      />
      <div className="review-note__editbar">
        <NoteSwatches
          className="review-note__swatches"
          value={note.color}
          onChange={(color) => useNotesStore.getState().updateNote(note.id, { color })}
        />
        <span className="review-note__hint">
          <kbd className="kbd">Esc</kbd> to finish
        </span>
        <button type="button" className="btn btn--ghost btn--sm review-note__delete" onClick={handleDelete}>
          <Trash2 /> Delete
        </button>
      </div>
    </>
  );
}
