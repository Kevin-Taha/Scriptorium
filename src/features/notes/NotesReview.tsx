import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { ArrowLeft, NotebookText, SearchX } from 'lucide-react';
import { navigate } from '@/app/router';
import { usePagesInverted } from '@/app/settingsStore';
import { useReaderStore } from '../reader/readerStore';
import { describeNoteCount, exportableNotes } from './exportMarkdown';
import { groupNotesByPage, useNotesStore } from './notesStore';
import { exportNotesAsMarkdown } from './reviewActions';
import { useReviewDensity } from './reviewDensity';
import {
  NO_FILTERS,
  countByColor,
  filterNotes,
  hasActiveFilters,
  searchTerms,
  type ReviewFilters,
} from './reviewFilter';
import { ReviewRow } from './ReviewRow';
import { ReviewToolbar } from './ReviewToolbar';
import { useReviewShortcuts } from './useReviewShortcuts';
import './review.css';

function countText(
  total: { notes: number; pages: number },
  shown: { notes: number; pages: number },
  filtering: boolean,
) {
  if (!filtering) return describeNoteCount(total.notes, total.pages);
  if (shown.notes === 0) return `0 of ${total.notes} ${total.notes === 1 ? 'note' : 'notes'}`;
  return `${shown.notes} of ${describeNoteCount(total.notes, shown.pages)}`;
}

/** Collated review of every page that has notes. */
export function NotesReview() {
  const docId = useReaderStore((s) => s.docId)!;
  const pdf = useReaderStore((s) => s.pdf)!;
  const outline = useReaderStore((s) => s.outline);
  const title = useReaderStore((s) => s.doc?.title) ?? 'Untitled';
  const notes = useNotesStore((s) => s.notes);
  const inverted = usePagesInverted();

  const [density, setDensity] = useReviewDensity();
  const [filters, setFilters] = useState<ReviewFilters>(NO_FILTERS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The filter box stays responsive while a large list catches up with the query.
  const appliedFilters = useDeferredValue(filters);
  const terms = useMemo(() => searchTerms(appliedFilters.query), [appliedFilters.query]);
  const visibleNotes = useMemo(
    () => filterNotes(notes, appliedFilters, editingId),
    [notes, appliedFilters, editingId],
  );
  const groups = useMemo(() => groupNotesByPage(visibleNotes), [visibleNotes]);
  const totalPages = useMemo(() => new Set(notes.map((n) => n.page)).size, [notes]);
  const colorCounts = useMemo(() => countByColor(notes), [notes]);
  const exportCount = useMemo(() => exportableNotes(notes).length, [notes]);

  const goBack = useCallback(() => navigate({ name: 'reader', docId }), [docId]);
  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);
  useReviewShortcuts({ onExit: goBack, onFocusSearch: focusSearch });

  const dense = density === 'dense';

  let body;
  if (notes.length === 0) {
    body = (
      <div className="empty-state">
        <div className="empty-state__icon">
          <NotebookText />
        </div>
        <h2 className="empty-state__title">Nothing to review yet</h2>
        <p className="empty-state__body">Notes you add while reading are collected here, page by page.</p>
        <div className="empty-state__actions">
          <button type="button" className="btn btn--primary" onClick={goBack}>
            <ArrowLeft /> Back to book
          </button>
        </div>
      </div>
    );
  } else if (groups.length === 0) {
    body = (
      <div className="empty-state">
        <div className="empty-state__icon">
          <SearchX />
        </div>
        <h2 className="empty-state__title">No notes match your filters</h2>
        <p className="empty-state__body">Try a different search, or include more colours.</p>
        <div className="empty-state__actions">
          <button type="button" className="btn" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="review__list" key={density}>
        {groups.map((group) => (
          <ReviewRow
            key={group.page}
            pdf={pdf}
            docId={docId}
            outline={outline}
            page={group.page}
            notes={group.notes}
            dense={dense}
            editingId={group.notes.some((n) => n.id === editingId) ? editingId : null}
            terms={terms}
            onEdit={setEditingId}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`review${dense ? ' review--dense' : ''}${inverted ? ' invert-pages' : ''}`}>
      <ReviewToolbar
        title={title}
        countText={countText(
          { notes: notes.length, pages: totalPages },
          { notes: visibleNotes.length, pages: groups.length },
          hasActiveFilters(appliedFilters),
        )}
        hasNotes={notes.length > 0}
        exportCount={exportCount}
        colorCounts={colorCounts}
        filters={filters}
        density={density}
        searchRef={searchRef}
        onFiltersChange={setFilters}
        onDensityChange={setDensity}
        onBack={goBack}
        onExport={() => exportNotesAsMarkdown(title, notes, outline)}
      />
      <main className="review__scroll" aria-label="Notes by page">
        <div className="review__column">{body}</div>
      </main>
    </div>
  );
}
