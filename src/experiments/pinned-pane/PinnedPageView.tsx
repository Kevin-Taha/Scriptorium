import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { cachedRender, pageAspect, renderPinnedPage, type RenderedPage } from './renderPinnedPage';

/** Space around the sheet; also the lead-in above the pinned offset. */
const PAD = 8;
const RENDER_DEBOUNCE_MS = 160;
const MIN_RENDER_WIDTH = 60;
const ZOOM = 2;
/** Until the page reports its real size (US Letter). */
const FALLBACK_ASPECT = 11 / 8.5;

interface PinnedPageViewProps {
  pdf: PDFDocumentProxy;
  page: number;
  offset: number;
  panelId: string;
  /** The active tab, when there are tabs. */
  tabId?: string;
  label: string;
}

interface ZoomAnchor {
  fx: number;
  fy: number;
  px: number;
  py: number;
}

/**
 * One page drawn to fit the pane width, scrollable, starting at `offset`.
 * Double-click zooms to twice the width and back.
 */
export function PinnedPageView({ pdf, page, offset, panelId, tabId, label }: PinnedPageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bitmapRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef('');
  const fractionRef = useRef(0);
  const anchorRef = useRef<ZoomAnchor | null>(null);
  const bitmapPageRef = useRef(0);
  const [viewWidth, setViewWidth] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [measured, setMeasured] = useState<{ page: number; aspect: number } | null>(null);
  const [rendered, setRendered] = useState<{ page: number; value: RenderedPage } | null>(null);

  useLayoutEffect(() => {
    const element = scrollRef.current!;
    const measure = () => setViewWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    pageAspect(pdf, page)
      .then((aspect) => live && setMeasured({ page, aspect }))
      .catch(() => {
        // The fallback proportions stay.
      });
    return () => {
      live = false;
    };
  }, [pdf, page]);

  const aspect = measured?.page === page ? measured.aspect : FALLBACK_ASPECT;
  const sheetWidth = Math.max(0, viewWidth - PAD * 2) * (zoomed ? ZOOM : 1);
  const sheetHeight = sheetWidth * aspect;
  const renderWidth = Math.round(sheetWidth);

  const exact = renderWidth >= MIN_RENDER_WIDTH ? cachedRender(pdf, page, renderWidth) : null;
  const current = exact ?? (rendered?.page === page ? rendered.value : null);
  const canvas = current?.canvas ?? null;

  useEffect(() => {
    if (renderWidth < MIN_RENDER_WIDTH || cachedRender(pdf, page, renderWidth)) return;
    const abort = new AbortController();
    // Resizing re-renders after a pause (the old bitmap is stretched meanwhile); a new page renders at once.
    const delay = bitmapPageRef.current === page ? RENDER_DEBOUNCE_MS : 0;
    const timer = window.setTimeout(() => {
      renderPinnedPage(pdf, page, renderWidth, abort.signal)
        .then((value) => {
          if (abort.signal.aborted) return;
          bitmapPageRef.current = page;
          setRendered({ page, value });
        })
        .catch(() => {
          // Cancelled by a newer render, or the page is unreadable: the skeleton stays.
        });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [pdf, page, renderWidth]);

  useLayoutEffect(() => {
    const host = bitmapRef.current;
    if (!host || !canvas) return;
    host.replaceChildren(canvas);
    return () => host.replaceChildren();
  }, [canvas]);

  const ready = viewWidth > 0 && measured?.page === page;
  // Land on the pinned offset, then keep the same spot as the pane is resized.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !ready) return;
    const key = `${page}:${offset}`;
    if (appliedRef.current !== key) {
      appliedRef.current = key;
      fractionRef.current = offset;
    }
    element.scrollTop = fractionRef.current * sheetHeight;
  }, [ready, page, offset, sheetHeight]);

  // Zooming keeps the double-clicked point under the pointer.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const anchor = anchorRef.current;
    if (!element || !anchor) return;
    anchorRef.current = null;
    element.scrollLeft = PAD + anchor.fx * sheetWidth - anchor.px;
    element.scrollTop = PAD + anchor.fy * sheetHeight - anchor.py;
    fractionRef.current = sheetHeight ? element.scrollTop / sheetHeight : 0;
  }, [zoomed, sheetWidth, sheetHeight]);

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!element || !sheetWidth || !sheetHeight) return;
    const box = element.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    anchorRef.current = {
      fx: (px + element.scrollLeft - PAD) / sheetWidth,
      fy: (py + element.scrollTop - PAD) / sheetHeight,
      px,
      py,
    };
    window.getSelection()?.removeAllRanges();
    setZoomed((value) => !value);
  };

  return (
    <div
      ref={scrollRef}
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      aria-label={tabId ? undefined : label}
      className={`pinned-pane__scroll${zoomed ? ' is-zoomed' : ''}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable panel must be focusable to scroll by keyboard
      tabIndex={0}
      title="Double-click to zoom"
      onDoubleClick={onDoubleClick}
      onScroll={(event) => {
        if (sheetHeight) fractionRef.current = event.currentTarget.scrollTop / sheetHeight;
      }}
    >
      <div
        key={page}
        className="pinned-pane__sheet page-thumb"
        style={{ width: sheetWidth, height: sheetHeight }}
      >
        <div ref={bitmapRef} className="pinned-pane__bitmap" />
        {!canvas && <div className="pinned-pane__skeleton" aria-hidden="true" />}
      </div>
    </div>
  );
}
