import { Fragment, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId } from '@/lib/types';
import type { AnnotationItem } from './annotations';
import { estimateAspect, peekThumbnail, requestThumbnail } from './reviewThumbnails';
import { observeNearViewport } from './reviewViewport';
import './highlights.css';

/** Thumbnails start rendering this far (px) before their row scrolls into view. */
const PRELOAD_MARGIN = 600;

interface ReviewThumbnailProps {
  pdf: PDFDocumentProxy;
  docId: DocId;
  page: number;
  items: AnnotationItem[];
  /** Item whose marker should stand out (hovered or focused in the row). */
  activeId: string | null;
}

/** A lazily rendered page thumbnail with a dot at each note's anchor and a bar over each highlight. */
export function ReviewThumbnail({ pdf, docId, page, items, activeId }: ReviewThumbnailProps) {
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
        {items.map((item) => {
          const active = item.id === activeId;
          const highlight = item.highlight;
          return (
            <Fragment key={`${item.kind}:${item.id}`}>
              {highlight?.rects.map((rect, index) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: rects have no identity and are replaced as a whole
                  key={index}
                  className={`review-row__highlight${active ? ' is-active' : ''}`}
                  data-note-color={highlight.color}
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.w * 100}%`,
                    height: `${rect.h * 100}%`,
                  }}
                  aria-hidden="true"
                />
              ))}
              {item.kind === 'note' && (
                <span
                  className={`review-row__dot${active ? ' is-active' : ''}`}
                  data-note-color={item.note.color}
                  style={{ top: `${item.note.y * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
