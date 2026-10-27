import { useMemo } from 'react';
import { NotebookText, StickyNote } from 'lucide-react';
import { navigate } from '@/app/router';
import { sectionForPage } from '@/lib/pdf/outline';
import type { MarginNote } from '@/lib/types';
import { useHistoryStore } from '../navigation/historyStore';
import { pageLabelFor } from '../navigation/pageLabels';
import { useReaderStore } from '../reader/readerStore';
import { buildAnnotations, groupAnnotationsByPage, type AnnotationItem } from './annotations';
import { jumpToHighlight } from './highlightActions';
import { useHighlightUiStore } from './highlightUi';
import { useHighlightsStore } from './highlightsStore';
import { NOTE_COLOR_LABELS } from './noteColors';
import { useNoteFocusStore } from './noteFocus';
import { useNotesStore } from './notesStore';
import './notes.css';

/** Where to scroll so the note lands comfortably below the top of the viewport. */
const JUMP_LEAD = 0.15;

function jumpToNote(note: MarginNote): void {
  useHistoryStore.getState().jumpTo({ page: note.page, offset: Math.max(0, note.y - JUMP_LEAD) });
  useNoteFocusStore.getState().pulseNote(note.id);
  if (note.highlightId) useHighlightUiStore.getState().pulse(note.highlightId);
}

/** "3 notes · 2 highlights" */
function describeTotals(noteCount: number, highlightCount: number): string {
  const parts: string[] = [];
  if (noteCount > 0) parts.push(`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);
  if (highlightCount > 0)
    parts.push(`${highlightCount} ${highlightCount === 1 ? 'highlight' : 'highlights'}`);
  return parts.join(' · ');
}

/** Sidebar tab: every note and highlight in this book, grouped by page. */
export function NotesPanel() {
  const notes = useNotesStore((s) => s.notes);
  const highlights = useHighlightsStore((s) => s.highlights);
  const docId = useReaderStore((s) => s.docId);
  const outline = useReaderStore((s) => s.outline);
  const pageLabels = useReaderStore((s) => s.pageLabels);

  const groups = useMemo(
    () => groupAnnotationsByPage(buildAnnotations(notes, highlights)),
    [notes, highlights],
  );
  // Only the set of pages matters for section titles, not the note text being typed.
  const pagesKey = groups.map((g) => g.page).join(',');
  const sections = useMemo(
    () =>
      new Map(
        pagesKey ? pagesKey.split(',').map((p) => [Number(p), sectionForPage(outline, Number(p))]) : [],
      ),
    [outline, pagesKey],
  );

  if (groups.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <StickyNote />
        </div>
        <h2 className="empty-state__title">No notes or highlights</h2>
        <p className="empty-state__body">
          Click the margin beside any page, or select text to highlight it or choose “Add margin note”.
        </p>
      </div>
    );
  }

  return (
    <div className="notes-panel">
      <div className="notes-panel__header">
        <span className="notes-panel__count">{describeTotals(notes.length, highlights.length)}</span>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => docId && navigate({ name: 'review', docId })}
        >
          <NotebookText />
          Review all
        </button>
      </div>

      {groups.map(({ page, items }) => (
        <section key={page} className="notes-panel__group" aria-label={`Notes on page ${page}`}>
          <h3 className="notes-panel__page">
            <span className="notes-panel__page-number">Page {pageLabelFor(pageLabels, page)}</span>
            {sections.get(page) && <span className="notes-panel__section">{sections.get(page)}</span>}
          </h3>
          <ul>
            {items.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <NotesPanelItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotesPanelItem({ item }: { item: AnnotationItem }) {
  if (item.kind === 'highlight') {
    const { highlight } = item;
    return (
      <button
        type="button"
        className="notes-panel__item"
        data-note-color={highlight.color}
        title={highlight.text}
        onClick={() => jumpToHighlight(highlight)}
      >
        <span className="notes-panel__bar" aria-hidden="true" />
        <span className="notes-panel__excerpt notes-panel__excerpt--quote">
          <span className="visually-hidden">{NOTE_COLOR_LABELS[highlight.color]} highlight: </span>
          {highlight.text}
        </span>
      </button>
    );
  }

  const { note } = item;
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
