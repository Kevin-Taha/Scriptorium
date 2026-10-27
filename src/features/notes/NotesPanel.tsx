import { useMemo } from 'react';
import { NotebookText, StickyNote } from 'lucide-react';
import { navigate } from '@/app/router';
import { sectionForPage } from '@/lib/pdf/outline';
import type { MarginNote } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { useReaderStore } from '../reader/readerStore';
import { NOTE_COLOR_LABELS } from './noteColors';
import { useNoteFocusStore } from './noteFocus';
import { groupNotesByPage, useNotesStore } from './notesStore';
import './notes.css';

/** Where to scroll so the note lands comfortably below the top of the viewport. */
const JUMP_LEAD = 0.15;

function jumpToNote(note: MarginNote): void {
  useHistoryStore.getState().jumpTo({ page: note.page, offset: Math.max(0, note.y - JUMP_LEAD) });
  useNoteFocusStore.getState().pulseNote(note.id);
}

/** Sidebar tab: every note in this book, grouped by page. */
export function NotesPanel() {
  const notes = useNotesStore((s) => s.notes);
  const docId = useReaderStore((s) => s.docId);
  const outline = useReaderStore((s) => s.outline);

  const groups = useMemo(() => groupNotesByPage(notes), [notes]);
  // Only the set of pages matters for section titles, not the note text being typed.
  const pagesKey = groups.map((g) => g.page).join(',');
  const sections = useMemo(
    () =>
      new Map(
        pagesKey ? pagesKey.split(',').map((p) => [Number(p), sectionForPage(outline, Number(p))]) : [],
      ),
    [outline, pagesKey],
  );

  if (notes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <StickyNote />
        </div>
        <h2 className="empty-state__title">No margin notes</h2>
        <p className="empty-state__body">
          Click the margin beside any page, or select text and choose “Add margin note”.
        </p>
      </div>
    );
  }

  return (
    <div className="notes-panel">
      <div className="notes-panel__header">
        <span className="notes-panel__count">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => docId && navigate({ name: 'review', docId })}
        >
          <NotebookText />
          Review all
        </button>
      </div>

      {groups.map(({ page, notes: pageNotes }) => (
        <section key={page} className="notes-panel__group" aria-label={`Notes on page ${page}`}>
          <h3 className="notes-panel__page">
            <span className="notes-panel__page-number">Page {page}</span>
            {sections.get(page) && <span className="notes-panel__section">{sections.get(page)}</span>}
          </h3>
          <ul>
            {pageNotes.map((note) => (
              <li key={note.id}>
                <NotesPanelItem note={note} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotesPanelItem({ note }: { note: MarginNote }) {
  const text = note.text.trim();
  const excerpt = text || note.quote;
  const modifier = text ? '' : note.quote ? ' notes-panel__excerpt--quote' : ' notes-panel__excerpt--empty';

  return (
    <button
      type="button"
      className="notes-panel__item"
      data-note-color={note.color}
      title={excerpt}
      onClick={() => jumpToNote(note)}
    >
      <span className="notes-panel__dot" aria-hidden="true" />
      <span className={`notes-panel__excerpt${modifier}`}>
        <span className="visually-hidden">{NOTE_COLOR_LABELS[note.color]} note: </span>
        {excerpt || 'Empty note'}
      </span>
    </button>
  );
}
