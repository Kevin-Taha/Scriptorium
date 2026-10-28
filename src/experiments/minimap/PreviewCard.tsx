import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import {
  estimateAspect,
  peekThumbnail,
  requestThumbnail,
  type PageThumbnail,
  type ThumbnailRequest,
} from '@/features/notes/reviewThumbnails';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId, Highlight, MarginNote, NoteColor } from '@/lib/types';
import { placeCard, type PageSummary } from './geometry';

/** A page the pointer rests on this long gets its thumbnail rendered; scrubbing past it doesn't. */
const SETTLE_MS = 70;
/** Keeps the caret this far from the card's rounded corners. */
const CARET_INSET = 16;

/**
 * The page's cached thumbnail, rendering it once the page has been held for a
 * moment. Renders share the review screen's cache and its two-at-a-time queue,
 * so fast scrubbing over a thousand pages never floods pdf.js.
 */
function usePageThumbnail(
  pdf: PDFDocumentProxy,
  docId: DocId,
  page: number,
  enabled: boolean,
): PageThumbnail | undefined {
  const [loaded, setLoaded] = useState<{ page: number; thumbnail: PageThumbnail } | null>(null);
  const cached = enabled ? peekThumbnail(docId, page) : undefined;

  useEffect(() => {
    if (!enabled || cached) return;
    let live = true;
    let request: ThumbnailRequest | null = null;
    const timer = window.setTimeout(() => {
      request = requestThumbnail(pdf, docId, page);
      request.promise.then(
        (thumbnail) => {
          if (live) setLoaded({ page, thumbnail });
        },
        () => {}, // cancelled or unreadable: the blank sheet stays
      );
    }, SETTLE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
      request?.cancel();
    };
  }, [pdf, docId, page, enabled, cached]);

  return cached ?? (loaded?.page === page ? loaded.thumbnail : undefined);
}

export interface PreviewCardProps {
  pdf: PDFDocumentProxy;
  docId: DocId;
  page: number;
  pageCount: number;
  /** Printed page label ("142", "xii"). */
  label: string;
  section: string | null;
  summary: PageSummary | undefined;
  notes: readonly MarginNote[];
  highlights: readonly Highlight[];
  /** Where on the rail the card points, in px from the top of the minimap. */
  y: number;
  /** Height of the minimap; the card stays inside it. */
  boundsHeight: number;
  /** Whether the page is the one being read. */
  current: boolean;
  /** While scrubbing the page itself is on screen: just the label and section. */
  compact: boolean;
}

/** Floating card beside the rail: a page thumbnail, its label, section and annotations. */
export function PreviewCard({
  pdf,
  docId,
  page,
  pageCount,
  label,
  section,
  summary,
  notes,
  highlights,
  y,
  boundsHeight,
  current,
  compact,
}: PreviewCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const thumbnail = usePageThumbnail(pdf, docId, page, !compact);
  const aspect = thumbnail?.aspect ?? estimateAspect(docId, page);

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const height = card.offsetHeight;
    const top = placeCard(y, height, boundsHeight);
    card.style.top = `${top}px`;
    const caret = Math.min(Math.max(y - top, CARET_INSET), Math.max(CARET_INSET, height - CARET_INSET));
    card.style.setProperty('--minimap-caret-y', `${caret}px`);
  });

  const numbered = label === String(page);
  return (
    <div ref={ref} className={`minimap-card${compact ? ' is-compact' : ''}`} aria-hidden="true">
      {!compact && (
        <div className="minimap-card__sheet page-thumb" style={{ aspectRatio: aspect }}>
          {thumbnail ? (
            <img key={page} className="minimap-card__image" src={thumbnail.url} alt="" draggable={false} />
          ) : (
            <span className="minimap-card__placeholder">{label}</span>
          )}
          {highlights.flatMap((highlight) =>
            highlight.rects.map((rect, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: rects have no identity and are replaced as a whole
                key={`${highlight.id}:${index}`}
                className="minimap-card__highlight"
                data-note-color={highlight.color}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                }}
              />
            )),
          )}
          {notes.map((note) => (
            <span
              key={note.id}
              className="minimap-card__anchor"
              data-note-color={note.color}
              style={{ top: `${note.y * 100}%` }}
            />
          ))}
          {summary?.bookmarked && <span className="minimap-card__ribbon" />}
        </div>
      )}
      <div className="minimap-card__meta">
        <p className="minimap-card__page">
          <strong>p. {label}</strong>
          <span className="minimap-card__of">
            {numbered ? `of ${pageCount}` : `(${page} of ${pageCount})`}
          </span>
          {current && <span className="minimap-card__here">You’re here</span>}
        </p>
        {section && <p className="minimap-card__section">{section}</p>}
        {summary && !compact && <SummaryLine summary={summary} />}
      </div>
    </div>
  );
}

function SummaryLine({ summary }: { summary: PageSummary }) {
  const { notes, highlights, bookmarked } = summary;
  if (!notes.length && !highlights.length && !bookmarked) return null;
  return (
    <p className="minimap-card__summary">
      {notes.length > 0 && (
        <span className="minimap-card__chip">
          <Swatches colors={notes} shape="dot" />
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
      )}
      {highlights.length > 0 && (
        <span className="minimap-card__chip">
          <Swatches colors={highlights} shape="bar" />
          {highlights.length} {highlights.length === 1 ? 'highlight' : 'highlights'}
        </span>
      )}
      {bookmarked && (
        <span className="minimap-card__chip minimap-card__chip--bookmark">
          <Bookmark aria-hidden="true" />
          Bookmarked
        </span>
      )}
    </p>
  );
}

function Swatches({ colors, shape }: { colors: readonly NoteColor[]; shape: 'dot' | 'bar' }) {
  const distinct = [...new Set(colors)].slice(0, 3);
  return (
    <span className={`minimap-card__swatches minimap-card__swatches--${shape}`}>
      {distinct.map((color) => (
        <span key={color} data-note-color={color} />
      ))}
    </span>
  );
}
