import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId, Highlight, MarginNote, NoteColor } from '@/lib/types';
import { plainNoteText } from '../notes/noteFormat';
import {
  estimateAspect,
  type PageThumbnail,
  peekThumbnail,
  requestThumbnail,
  type ThumbnailRequest,
} from '../notes/reviewThumbnails';
import { type PageSummary, placeCard } from './geometry';
import type { MapItem } from './snap';

/** A page the pointer rests on this long gets its thumbnail rendered; scrubbing past it doesn't. */
const SETTLE_MS = 70;
/** Keeps the caret this far from the card's rounded corners. */
const CARET_INSET = 16;
/** Snapped annotations listed before "+N more". */
const MAX_ITEMS = 3;

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
  labelOf(page: number): string;
  section: string | null;
  summary: PageSummary;
  /** The page's notes and highlights, drawn on the thumbnail. */
  notes: readonly MarginNote[];
  highlights: readonly Highlight[];
  /** Annotations the pointer has snapped to: listed instead of the page's counts, and emphasised. */
  snapped: readonly MapItem[] | null;
  /** Where on the rail the card points, in px from the top of the map. */
  y: number;
  /** Height of the map; the card stays inside it. */
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
  labelOf,
  section,
  summary,
  notes,
  highlights,
  snapped,
  y,
  boundsHeight,
  current,
  compact,
}: PreviewCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const thumbnail = usePageThumbnail(pdf, docId, page, !compact);
  const aspect = thumbnail?.aspect ?? estimateAspect(docId, page);
  const targets = new Set(
    snapped?.flatMap((item) =>
      item.kind === 'note' && item.highlight ? [item.id, item.highlight.id] : [item.id],
    ),
  );

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const height = card.offsetHeight;
    const top = placeCard(y, height, boundsHeight);
    card.style.top = `${top}px`;
    const caret = Math.min(Math.max(y - top, CARET_INSET), Math.max(CARET_INSET, height - CARET_INSET));
    card.style.setProperty('--book-map-caret-y', `${caret}px`);
  });

  const pageLabel = labelOf(page);
  return (
    <div ref={ref} className={`book-map-card${compact ? ' is-compact' : ''}`} aria-hidden="true">
      {!compact && (
        <div className="book-map-card__sheet page-thumb" style={{ aspectRatio: aspect }}>
          {thumbnail ? (
            <img key={page} className="book-map-card__image" src={thumbnail.url} alt="" draggable={false} />
          ) : (
            <span className="book-map-card__placeholder">{pageLabel}</span>
          )}
          {highlights.flatMap((highlight) =>
            highlight.rects.map((rect, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: rects have no identity and are replaced as a whole
                key={`${highlight.id}:${index}`}
                className={`book-map-card__highlight${targets.has(highlight.id) ? ' is-target' : ''}`}
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
              className={`book-map-card__anchor${targets.has(note.id) ? ' is-target' : ''}`}
              data-note-color={note.color}
              style={{ top: `${note.y * 100}%` }}
            />
          ))}
          {summary.bookmarked && <span className="book-map-card__ribbon" />}
        </div>
      )}
      <div className="book-map-card__meta">
        <p className="book-map-card__page">
          <strong>p. {pageLabel}</strong>
          <span className="book-map-card__of">
            {pageLabel === String(page) ? `of ${pageCount}` : `(${page} of ${pageCount})`}
          </span>
          {current && <span className="book-map-card__here">You’re here</span>}
        </p>
        {section && <p className="book-map-card__section">{section}</p>}
        {!compact &&
          (snapped ? (
            <SnappedItems items={snapped} page={page} labelOf={labelOf} />
          ) : (
            <SummaryLine summary={summary} />
          ))}
      </div>
    </div>
  );
}

/** What the pointer has snapped to, so you know what a click lands on. */
function SnappedItems({
  items,
  page,
  labelOf,
}: {
  items: readonly MapItem[];
  page: number;
  labelOf(page: number): string;
}) {
  return (
    <ul className="book-map-card__items">
      {items.slice(0, MAX_ITEMS).map((item) => (
        <li
          key={`${item.kind}:${item.id}`}
          className={`book-map-card__item book-map-card__item--${item.kind}`}
          data-note-color={
            item.kind === 'note'
              ? item.note.color
              : item.kind === 'highlight'
                ? item.highlight.color
                : undefined
          }
        >
          {item.kind === 'bookmark' ? (
            <Bookmark aria-hidden="true" />
          ) : (
            <span className="book-map-card__swatch" />
          )}
          <ItemText item={item} />
          {item.page !== page && <span className="book-map-card__item-page">p. {labelOf(item.page)}</span>}
        </li>
      ))}
      {items.length > MAX_ITEMS && (
        <li className="book-map-card__more">+{items.length - MAX_ITEMS} more nearby</li>
      )}
    </ul>
  );
}

function ItemText({ item }: { item: MapItem }) {
  if (item.kind === 'bookmark') return <span className="book-map-card__text">{item.bookmark.label}</span>;
  if (item.kind === 'highlight')
    return <span className="book-map-card__text book-map-card__text--quote">{item.highlight.text}</span>;
  const text = plainNoteText(item.note.text).trim();
  if (text) return <span className="book-map-card__text book-map-card__text--note">{text}</span>;
  if (item.note.quote)
    return <span className="book-map-card__text book-map-card__text--quote">{item.note.quote}</span>;
  return <span className="book-map-card__text book-map-card__text--empty">Empty note</span>;
}

function SummaryLine({ summary }: { summary: PageSummary }) {
  const { notes, highlights, bookmarked } = summary;
  if (!notes.length && !highlights.length && !bookmarked) return null;
  return (
    <p className="book-map-card__summary">
      {notes.length > 0 && (
        <span className="book-map-card__chip">
          <Swatches colors={notes} shape="dot" />
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
      )}
      {highlights.length > 0 && (
        <span className="book-map-card__chip">
          <Swatches colors={highlights} shape="bar" />
          {highlights.length} {highlights.length === 1 ? 'highlight' : 'highlights'}
        </span>
      )}
      {bookmarked && (
        <span className="book-map-card__chip book-map-card__chip--bookmark">
          <Bookmark aria-hidden="true" />
          Bookmarked
        </span>
      )}
    </p>
  );
}

function Swatches({ colors, shape }: { colors: readonly NoteColor[]; shape: 'dot' | 'bar' }) {
  return (
    <span className={`book-map-card__swatches book-map-card__swatches--${shape}`}>
      {[...new Set(colors)].slice(0, 3).map((color) => (
        <span key={color} data-note-color={color} />
      ))}
    </span>
  );
}
