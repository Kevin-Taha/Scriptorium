import { memo, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { sectionForPage } from '@/lib/pdf/outline';
import type { DocId, MarginNote, OutlineItem } from '@/lib/types';
import { jumpToPage } from './reviewActions';
import { sameNotes } from './reviewFilter';
import { ReviewNote } from './ReviewNote';
import { ReviewThumbnail } from './ReviewThumbnail';

interface ReviewRowProps {
  pdf: PDFDocumentProxy;
  docId: DocId;
  outline: OutlineItem[];
  page: number;
  notes: MarginNote[];
  dense: boolean;
  /** The note being edited, when it is on this page. */
  editingId: string | null;
  terms: string[];
  onEdit(id: string | null): void;
}

function areEqual(prev: ReviewRowProps, next: ReviewRowProps): boolean {
  return (
    prev.pdf === next.pdf &&
    prev.docId === next.docId &&
    prev.outline === next.outline &&
    prev.page === next.page &&
    prev.dense === next.dense &&
    prev.editingId === next.editingId &&
    prev.terms === next.terms &&
    prev.onEdit === next.onEdit &&
    sameNotes(prev.notes, next.notes)
  );
}

/** A page with notes: thumbnail (comfortable only), page heading and the page's notes. */
export const ReviewRow = memo(function ReviewRow({
  pdf,
  docId,
  outline,
  page,
  notes,
  dense,
  editingId,
  terms,
  onEdit,
}: ReviewRowProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const section = useMemo(() => sectionForPage(outline, page), [outline, page]);
  const headingId = `review-page-${page}`;

  return (
    <section className="review-row" aria-labelledby={headingId}>
      {!dense && <ReviewThumbnail pdf={pdf} docId={docId} page={page} notes={notes} activeId={activeId} />}
      <div className="review-row__body">
        <header className="review-row__header">
          <h2 className="review-row__title" id={headingId}>
            <span className="review-row__page">Page {page}</span>
            {section && (
              <>
                <span className="review-row__separator" aria-hidden="true">
                  ·
                </span>
                <span className="review-row__section" title={section}>
                  {section}
                </span>
              </>
            )}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm review-row__go"
            aria-label={`Go to page ${page}`}
            onClick={() => jumpToPage(docId, page)}
          >
            <ArrowUpRight /> Go to page
          </button>
        </header>
        <ul className="review-row__notes">
          {notes.map((note) => (
            <li key={note.id}>
              <ReviewNote
                note={note}
                editing={note.id === editingId}
                terms={terms}
                onEdit={onEdit}
                onActive={setActiveId}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}, areEqual);
