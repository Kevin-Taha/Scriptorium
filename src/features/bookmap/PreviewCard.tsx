import { useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { sectionForPage } from '@/lib/pdf/outline';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId } from '@/lib/types';
import { clamp } from '@/lib/util';
import { useBookmarksStore } from '../navigation/bookmarksStore';
import { pageLabelFor } from '../navigation/pageLabels';
import type { AnnotationItem } from '../notes/annotations';
import { useHighlightsStore } from '../notes/highlightsStore';
import { plainNoteText } from '../notes/noteFormat';
import { useNotesStore } from '../notes/notesStore';
import {
  estimateAspect,
  type PageThumbnail,
  peekThumbnail,
  requestThumbnail,
  type ThumbnailRequest,
} from '../notes/reviewThumbnails';
import { useReaderStore } from '../reader/readerStore';
import { describePage, type MapItem } from './geometry';

/** A page the pointer rests on this long gets its thumbnail rendered; scrubbing past it doesn't. */
const SETTLE_MS = 70;
/** Snapped annotations listed, at most. */
const MAX_ITEMS = 3;

/** The page's thumbnail, from the review screen's cache or rendered (through its queue) once the page is held. */
function usePageThumbnail(
  pdf: PDFDocumentProxy,
  docId: DocId,
  page: number,
  enabled: boolean,
): PageThumbnail | undefined {
  const [, rendered] = useReducer((n: number) => n + 1, 0);
  const thumbnail = enabled ? peekThumbnail(docId, page) : undefined;
  useEffect(() => {
    if (!enabled || thumbnail) return;
    let request: ThumbnailRequest | undefined;
    const timer = window.setTimeout(() => {
      request = requestThumbnail(pdf, docId, page);
      request.promise.then(rendered, () => {}); // cancelled or unreadable: the blank sheet stays
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      request?.cancel();
    };
  }, [pdf, docId, page, enabled, thumbnail]);
  return thumbnail;
}

interface PreviewCardProps {
  pdf: PDFDocumentProxy;
  docId: DocId;
  page: number;
  pageCount: number;
  /** Annotations the pointer has snapped to: listed instead of the page's counts. */
  snapped: readonly MapItem[] | null;
  /** Where the card points, in px from the top of the map. */
  y: number;
  /** While scrubbing the page itself is on screen: just its label and section. */
  compact: boolean;
}

/** Floating card beside the rail: the page's thumbnail with its annotations, its label and section. */
export function PreviewCard({ pdf, docId, page, pageCount, snapped, y, compact }: PreviewCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const outline = useReaderStore((s) => s.outline);
  const label = useReaderStore((s) => pageLabelFor(s.pageLabels, page));
  const notes = useNotesStore((s) => s.notes);
  const highlights = useHighlightsStore((s) => s.highlights);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const section = useMemo(() => sectionForPage(outline, page), [outline, page]);
  const onPage = useMemo(
    () => ({
      notes: notes.filter((n) => n.page === page),
      highlights: highlights.filter((h) => h.page === page),
      summary: describePage(page, notes, highlights, bookmarks),
    }),
    [page, notes, highlights, bookmarks],
  );
  const thumbnail = usePageThumbnail(pdf, docId, page, !compact);

  // Centred on `y` but kept inside the map; the caret stays on `y`.
  useLayoutEffect(() => {
    const card = ref.current!;
    const height = card.offsetHeight;
    const top = clamp(y - height / 2, 8, Math.max(8, card.offsetParent!.clientHeight - height - 8));
    card.style.top = `${top}px`;
    card.style.setProperty('--caret-y', `${clamp(y - top, 16, height - 16)}px`);
  });

  return (
    <div ref={ref} className={`book-map-card${compact ? ' is-compact' : ''}`} aria-hidden="true">
      {!compact && (
        <div
          className="book-map-card__sheet page-thumb"
          style={{ aspectRatio: thumbnail?.aspect ?? estimateAspect(docId, page) }}
        >
          {thumbnail && <img src={thumbnail.url} alt="" draggable={false} />}
          {onPage.highlights.flatMap((highlight) =>
            highlight.rects.map((rect, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: rects have no identity and are replaced as a whole
                key={`${highlight.id}:${index}`}
                className="book-map-card__highlight"
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
          {onPage.notes.map((note) => (
            <span
              key={note.id}
              className="book-map-card__dot"
              data-note-color={note.color}
              style={{ top: `${note.y * 100}%` }}
            />
          ))}
        </div>
      )}
      <p className="book-map-card__page">
        <strong>p. {label}</strong> {label === String(page) ? `of ${pageCount}` : `(${page} of ${pageCount})`}
      </p>
      {section && <p className="book-map-card__section">{section}</p>}
      {!compact && snapped && (
        <ul className="book-map-card__items">
          {snapped.slice(0, MAX_ITEMS).map((item) => (
            <li
              key={`${item.kind}:${item.id}`}
              data-note-color={item.kind === 'bookmark' ? undefined : colorOf(item)}
            >
              {textOf(item)}
            </li>
          ))}
        </ul>
      )}
      {!compact && !snapped && onPage.summary && <p className="book-map-card__summary">{onPage.summary}</p>}
    </div>
  );
}

const colorOf = (item: AnnotationItem) => (item.kind === 'note' ? item.note : item.highlight).color;

function textOf(item: MapItem): string {
  if (item.kind === 'bookmark') return item.bookmark.label || 'Bookmark';
  if (item.kind === 'highlight') return item.highlight.text;
  return plainNoteText(item.note.text).trim() || item.note.quote || 'Empty note';
}
