import { memo, useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId, OutlineItem } from '@/lib/types';
import { sameAnnotations, type AnnotationItem } from './annotations';
import { ReviewRow } from './ReviewRow';
import { observeNearViewport } from './reviewViewport';

const PRELOAD_MARGIN = 1200;

interface ReviewPageSlotProps {
  pdf: PDFDocumentProxy;
  docId: DocId;
  outline: OutlineItem[];
  page: number;
  items: AnnotationItem[];
  dense: boolean;
  editingId: string | null;
  terms: string[];
  onEdit(id: string | null): void;
  onDeleteFocus(id: string): void;
  virtual: boolean;
  forced: boolean;
  width: number;
}

function estimateHeight(items: AnnotationItem[], dense: boolean, width: number): number {
  const charsPerLine = Math.max(12, Math.floor(((width || 840) - (dense ? 90 : 250)) / 7));
  const lines = (text: string) =>
    text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  const content = items.reduce((height, item) => {
    if (item.kind === 'highlight')
      return height + 16 + Math.min(dense ? 3 : 4, lines(item.highlight.text)) * 22;
    const quote = item.highlight?.text ?? item.note.quote;
    const quoteHeight = quote ? 4 + Math.min(dense ? 2 : 3, lines(quote)) * 18 : 0;
    return height + (dense ? 8 : 16) + lines(item.note.text) * (dense ? 20 : 22) + quoteHeight;
  }, 44);
  return dense ? content : Math.max(248, content);
}

function signature(items: AnnotationItem[]): string {
  return items
    .map((item) =>
      item.kind === 'note'
        ? `${item.id}:${item.note.text.length}:${(item.highlight?.text ?? item.note.quote ?? '').length}`
        : `${item.id}:${item.highlight.text.length}`,
    )
    .join('|');
}

/** Keeps a measured placeholder for distant pages and mounts their contents near the viewport. */
export const ReviewPageSlot = memo(
  function ReviewPageSlot(props: ReviewPageSlotProps) {
    const { page, items, dense, virtual, forced, width } = props;
    const ref = useRef<HTMLDivElement>(null);
    const [near, setNear] = useState(!virtual);
    const [focused, setFocused] = useState(false);
    const focusFromEnd = useRef<boolean | null>(null);
    const [measurement, setMeasurement] = useState<{ height: number; signature: string; width: number }>();
    const itemSignature = signature(items);
    const mounted = !virtual || near || focused || forced;

    useEffect(() => {
      const element = ref.current;
      if (!element || !virtual) return;
      return observeNearViewport(element, element.closest('.review__scroll'), PRELOAD_MARGIN, setNear);
    }, [virtual]);

    useLayoutEffect(() => {
      const element = ref.current;
      if (!element || !mounted) return;
      const measure = () => {
        const height = element.getBoundingClientRect().height;
        if (height <= 0) return;
        setMeasurement((prev) =>
          prev?.height === height && prev.signature === itemSignature && prev.width === width
            ? prev
            : { height, signature: itemSignature, width },
        );
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }, [mounted, itemSignature, width]);

    useLayoutEffect(() => {
      if (!mounted || focusFromEnd.current === null) return;
      const controls = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]');
      const target = focusFromEnd.current ? controls?.item(controls.length - 1) : controls?.item(0);
      focusFromEnd.current = null;
      target?.focus();
    }, [mounted]);

    const onFocus = (event: FocusEvent<HTMLDivElement>) => {
      setFocused(true);
      if (event.target !== event.currentTarget) return;
      const from = event.relatedTarget;
      focusFromEnd.current = !!(
        from && event.currentTarget.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    };
    const height =
      measurement?.signature === itemSignature && measurement.width === width
        ? measurement.height
        : estimateHeight(items, dense, width);

    return (
      <div
        ref={ref}
        className="review-page-slot"
        data-page={page}
        style={mounted ? undefined : { height }}
        role="group"
        tabIndex={mounted ? undefined : 0}
        aria-label={mounted ? undefined : `Load notes on page ${page}`}
        onFocus={onFocus}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        {mounted && (
          <ReviewRow
            pdf={props.pdf}
            docId={props.docId}
            outline={props.outline}
            page={page}
            items={items}
            dense={dense}
            editingId={props.editingId}
            terms={props.terms}
            onEdit={props.onEdit}
            onDeleteFocus={props.onDeleteFocus}
          />
        )}
      </div>
    );
  },
  (a, b) =>
    a.pdf === b.pdf &&
    a.docId === b.docId &&
    a.outline === b.outline &&
    a.page === b.page &&
    a.dense === b.dense &&
    a.editingId === b.editingId &&
    a.terms === b.terms &&
    a.onEdit === b.onEdit &&
    a.onDeleteFocus === b.onDeleteFocus &&
    a.virtual === b.virtual &&
    a.forced === b.forced &&
    a.width === b.width &&
    sameAnnotations(a.items, b.items),
);
