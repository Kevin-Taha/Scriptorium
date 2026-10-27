import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId, MarginNote } from '@/lib/types';
import { estimateAspect, peekThumbnail, requestThumbnail } from './reviewThumbnails';
import { observeNearViewport } from './reviewViewport';

/** Thumbnails start rendering this far (px) before their row scrolls into view. */
const PRELOAD_MARGIN = 600;

interface ReviewThumbnailProps {
  pdf: PDFDocumentProxy;
  docId: DocId;
  page: number;
  notes: MarginNote[];
  /** Note whose anchor dot should stand out (hovered or focused in the row). */
  activeId: string | null;
}

/** A lazily rendered page thumbnail with a dot at each note's anchor. */
export function ReviewThumbnail({ pdf, docId, page, notes, activeId }: ReviewThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumbnail, setThumbnail] = useState(() => peekThumbnail(docId, page));
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || thumbnail) return;
    return observeNearViewport(element, element.closest('.review__scroll'), PRELOAD_MARGIN, setNear);
  }, [thumbnail]);

  useEffect(() => {
    if (!near || thumbnail) return;
    const request = requestThumbnail(pdf, docId, page);
    let current = true;
    request.promise.then(
      (loaded) => {
        if (current) setThumbnail(loaded);
      },
      () => {}, // a failed or cancelled render just leaves the blank placeholder
    );
    return () => {
      current = false;
      request.cancel();
    };
  }, [near, thumbnail, pdf, docId, page]);

  return (
    <div className="review-row__thumb" ref={ref}>
      <div className="page-thumb" style={{ aspectRatio: thumbnail?.aspect ?? estimateAspect(docId, page) }}>
        {thumbnail && <img className="page-thumb__image" src={thumbnail.url} alt="" draggable={false} />}
        {notes.map((note) => (
          <span
            key={note.id}
            className={`review-row__dot${note.id === activeId ? ' is-active' : ''}`}
            data-note-color={note.color}
            style={{ top: `${note.y * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
