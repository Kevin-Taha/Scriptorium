import { type ReactElement, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { ArrowLeft, NotebookText, SearchX } from 'lucide-react';
import { navigate } from '@/app/router';
import { usePagesInverted } from '@/app/settingsStore';
import { useReaderStore } from '../reader/readerStore';
import { buildAnnotations, groupAnnotationsByPage } from './annotations';
import { describeAnnotationCount, exportableHighlights, exportableNotes } from './exportMarkdown';
import { useHighlightsStore } from './highlightsStore';
import { useNotesStore } from './notesStore';
import { exportNotesAsMarkdown } from './reviewActions';
import { useReviewDensity } from './reviewDensity';
import {
  NO_FILTERS,
  countAnnotationsByColor,
  filterAnnotations,
  hasActiveFilters,
  searchTerms,
  type ReviewFilters,
} from './reviewFilter';
import { ReviewRow } from './ReviewRow';
import { ReviewToolbar } from './ReviewToolbar';
import { useReviewShortcuts } from './useReviewShortcuts';
import './review.css';

interface Totals {
  notes: number;
  highlights: number;
  pages: number;
}

/** "3 notes and 2 highlights on 4 pages", or "5 of 12 notes and highlights on 2 pages" while filtering. */
function countText(total: Totals, shown: Totals, filtering: boolean): string {
  if (!filtering) return describeAnnotationCount(total.notes, total.highlights, total.pages);
  const shownCount = shown.notes + shown.highlights;
  const totalCount = total.notes + total.highlights;
  const noun = total.highlights === 0 ? 'notes' : total.notes === 0 ? 'highlights' : 'notes and highlights';
  if (shownCount === 0) return `0 of ${totalCount} ${noun}`;
  return `${shownCount} of ${totalCount} ${noun} on ${shown.pages} ${shown.pages === 1 ? 'page' : 'pages'}`;
}

/** Collated review of every page that has notes or highlights. */
export function NotesReview() {
  const docId = useReaderStore((s) => s.docId)!;
  const pdf = useReaderStore((s) => s.pdf)!;
  const outline = useReaderStore((s) => s.outline);
  const title = useReaderStore((s) => s.doc?.title) ?? 'Untitled';
  const notes = useNotesStore((s) => s.notes);
  const highlights = useHighlightsStore((s) => s.highlights);
  const inverted = usePagesInverted();

  const [density, setDensity] = useReviewDensity();
  const [filters, setFilters] = useState<ReviewFilters>(NO_FILTERS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The filter box stays responsive while a large list catches up with the query.
  const appliedFilters = useDeferredValue(filters);
  const terms = useMemo(() => searchTerms(appliedFilters.query), [appliedFilters.query]);
  const items = useMemo(() => buildAnnotations(notes, highlights), [notes, highlights]);
  const visibleItems = useMemo(
    () => filterAnnotations(items, appliedFilters, editingId),
    [items, appliedFilters, editingId],
  );
  const groups = useMemo(() => groupAnnotationsByPage(visibleItems), [visibleItems]);
  const totalPages = useMemo(() => new Set(items.map((item) => item.page)).size, [items]);
  const colorCounts = useMemo(() => countAnnotationsByColor(items), [items]);
  const exportCount = useMemo(
    () => exportableNotes(notes).length + exportableHighlights(highlights).length,
    [notes, highlights],
  );
  const shownCounts = useMemo(() => {
    let noteCount = 0;
    let highlightCount = 0;
    for (const item of visibleItems) {
      if (item.kind === 'note') noteCount += 1;
      if (item.highlight) highlightCount += 1;
    }
    return { notes: noteCount, highlights: highlightCount, pages: groups.length };
  }, [visibleItems, groups.length]);

  const goBack = useCallback(() => navigate({ name: 'reader', docId }), [docId]);
  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);
  useReviewShortcuts({ onExit: goBack, onFocusSearch: focusSearch });

  const dense = density === 'dense';

  let body: ReactElement;
  if (items.length === 0) {
    body = (
      <div className="empty-state">
        <div className="empty-state__icon">
          <NotebookText />
        </div>
        <h2 className="empty-state__title">Nothing to review yet</h2>
        <p className="empty-state__body">
          Notes and highlights you add while reading are collected here, page by page.
        </p>
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
            items={group.items}
            dense={dense}
            editingId={group.items.some((item) => item.id === editingId) ? editingId : null}
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
          { notes: notes.length, highlights: highlights.length, pages: totalPages },
          shownCounts,
          hasActiveFilters(appliedFilters),
        )}
        hasNotes={items.length > 0}
        exportCount={exportCount}
        colorCounts={colorCounts}
        filters={filters}
        density={density}
        searchRef={searchRef}
        onFiltersChange={setFilters}
        onDensityChange={setDensity}
        onBack={goBack}
        onExport={() => exportNotesAsMarkdown(title, notes, highlights, outline)}
      />
      <main className="review__scroll" aria-label="Notes by page">
        <div className="review__column">{body}</div>
      </main>
    </div>
  );
}
