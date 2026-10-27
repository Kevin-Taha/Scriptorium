import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { PDF_TO_CSS_UNITS, type PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { ReadingLocation } from '@/lib/types';
import { clamp } from '@/lib/util';
import { LinkPeek } from './LinkPeek';
import { PageRenderer } from './pageRenderer';
import { pageSizeIndex } from './pageSizes';
import { PageView } from './PageView';
import { MAX_SCALE, MIN_SCALE, useReaderStore, type ViewerController } from './readerStore';
import {
  DEFAULT_METRICS,
  computeLayout,
  containerWidth,
  fitScale,
  isWheelNotch,
  pagesAroundViewport,
  pinchZoomFactor,
  rowLeft,
  scrollTopFor,
  type LayoutMetrics,
} from './viewerLayout';
import { ROW_OVERSCAN, ViewportSync } from './viewportSync';
import { nextZoomStep } from './zoom';
import './viewer.css';

export interface PageSize {
  width: number;
  height: number;
}

export interface ViewerProps {
  pdf: PDFDocumentProxy;
  /** Called with the target of an internal PDF link; the caller records history. */
  onLinkClick(target: ReadingLocation): void;
  /** Content rendered in the margin column to the right of each page. */
  renderMargin?(page: number, size: PageSize): ReactNode;
  /** Content layered over each page sheet (ribbons, note markers). */
  renderPageOverlay?(page: number, size: PageSize): ReactNode;
}

interface ViewportFrame {
  width: number;
  height: number;
  metrics: LayoutMetrics;
}

/** Continuous, virtualized PDF page view. */
export function Viewer(props: ViewerProps) {
  // A new document gets a fresh renderer, size index and scroll state.
  return <DocumentViewer key={documentKey(props.pdf)} {...props} />;
}

function DocumentViewer({ pdf, onLinkClick, renderMargin, renderPageOverlay }: ViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoom = useReaderStore((s) => s.zoom);
  const setZoom = useReaderStore((s) => s.setZoom);
  const setController = useReaderStore((s) => s.setController);

  const [frame, setFrame] = useState<ViewportFrame | null>(null);
  const [rowAnchor, setRowAnchor] = useState<ReadingLocation>(() => useReaderStore.getState().location);
  const [sizeIndex] = useState(() => pageSizeIndex(pdf));
  const [renderer] = useState(() => new PageRenderer(pdf, (page, proxy) => sizeIndex.record(page, proxy)));
  const [sync] = useState(
    () =>
      new ViewportSync(renderer, {
        initialLocation: () => useReaderStore.getState().location,
        onLocation: (location) => useReaderStore.getState().setLocation(location),
        onRowsStale: setRowAnchor,
      }),
  );
  const sizes = useSyncExternalStore(sizeIndex.subscribe, sizeIndex.getSnapshot);

  const scale = zoom.scale * PDF_TO_CSS_UNITS;
  const metrics = frame?.metrics;
  const layout = useMemo(
    () => (sizes && metrics ? computeLayout(sizes, scale, metrics) : null),
    [sizes, scale, metrics],
  );
  const rows = useMemo(
    () =>
      layout && frame
        ? pagesAroundViewport(layout, scrollTopFor(layout, rowAnchor), frame.height, ROW_OVERSCAN)
        : null,
    [layout, frame, rowAnchor],
  );
  const width = layout && frame ? containerWidth(layout, frame.width) : 0;

  useLayoutEffect(() => {
    const element = viewportRef.current!;
    const measure = () =>
      setFrame((prev) => {
        const metrics = readMetrics(element, prev?.metrics);
        const { clientWidth: width, clientHeight: height } = element;
        if (prev && prev.width === width && prev.height === height && prev.metrics === metrics) return prev;
        return { width, height, metrics };
      });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => sync.connect(viewportRef.current!), [sync]);
  useEffect(() => () => renderer.dispose(), [renderer]);
  useEffect(() => sizeIndex.load(() => sync.currentPage()), [sizeIndex, sync]);

  useEffect(() => {
    renderer.setLinkHandler(onLinkClick);
    return () => renderer.setLinkHandler(null);
  }, [renderer, onLinkClick]);

  useEffect(() => {
    // Keyboard scrolling works straight away; the ring appears once the reader tabs here.
    viewportRef.current?.focus({ preventScroll: true, focusVisible: false });
  }, []);

  useEffect(() => {
    const controller: ViewerController = {
      scrollTo: (location, options) => sync.scrollTo(location, options),
      getLocation: () => sync.getLocation(),
      getVisibleCenter: () => sync.getVisibleCenter(),
      getPageSize: (page) => sync.getPageSize(page),
    };
    setController(controller);
    return () => {
      if (useReaderStore.getState().controller === controller) setController(null);
    };
  }, [sync, setController]);

  // Fit modes: derive the scale from the viewport and the current page, and report it.
  // Recomputed when the mode or the relevant viewport dimension changes, not when
  // background sizes arrive (that would rescale mid-read on mixed-size books).
  const sizesReady = sizes !== null;
  const fitWidth = frame?.width ?? 0;
  const fitHeight = zoom.mode === 'fit-page' ? (frame?.height ?? 0) : 0;
  useLayoutEffect(() => {
    const snapshot = sizeIndex.getSnapshot();
    if (zoom.mode === 'custom' || !snapshot || !metrics) return;
    const i = clamp(sync.currentPage(), 1, snapshot.widths.length) - 1;
    const page = { width: snapshot.widths[i], height: snapshot.heights[i] };
    const viewport = { width: fitWidth, height: fitHeight };
    const fitted = fitScale(zoom.mode, page, viewport, metrics) / PDF_TO_CSS_UNITS;
    setZoom({ mode: zoom.mode, scale: clamp(Math.round(fitted * 10_000) / 10_000, MIN_SCALE, MAX_SCALE) });
  }, [zoom.mode, sizesReady, fitWidth, fitHeight, metrics, sizeIndex, sync, setZoom]);

  useLayoutEffect(() => {
    if (layout && rows) sync.apply(layout, rows);
  }, [sync, layout, rows]);

  // Ctrl/Cmd + wheel and trackpad pinch zoom the document instead of the browser.
  useEffect(() => {
    const element = viewportRef.current!;
    let pending: number | null = null;
    let frameRequest = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = pending ?? useReaderStore.getState().zoom.scale;
      pending = isWheelNotch(event.deltaY, event.deltaMode)
        ? nextZoomStep(current, event.deltaY < 0 ? 1 : -1)
        : clamp(current * pinchZoomFactor(event.deltaY), MIN_SCALE, MAX_SCALE);
      if (frameRequest) return;
      frameRequest = requestAnimationFrame(() => {
        frameRequest = 0;
        if (pending !== null) useReaderStore.getState().setZoom({ mode: 'custom', scale: pending });
        pending = null;
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(frameRequest);
    };
  }, []);

  const pages: number[] = [];
  if (rows) for (let page = rows.first; page <= rows.last; page++) pages.push(page);

  return (
    <>
      <div
        ref={viewportRef}
        className="reader__viewport"
        tabIndex={0}
        role="region"
        aria-label="Pages"
        aria-busy={!layout}
      >
        {layout && (
          <div className="reader__pages" style={{ width, height: layout.totalHeight }}>
            {pages.map((page) => (
              <PageView
                key={page}
                page={page}
                top={layout.tops[page - 1]}
                left={rowLeft(layout, page, width)}
                width={layout.widths[page - 1]}
                height={layout.heights[page - 1]}
                scale={layout.scale}
                renderer={renderer}
                renderMargin={renderMargin}
                renderPageOverlay={renderPageOverlay}
              />
            ))}
          </div>
        )}
      </div>
      <LinkPeek pdf={pdf} viewportRef={viewportRef} onNavigate={onLinkClick} />
    </>
  );
}

/** Reads the layout tokens the CSS uses, so the layout math always matches it. */
function readMetrics(element: HTMLElement, previous?: LayoutMetrics): LayoutMetrics {
  const style = getComputedStyle(element);
  const length = (name: string, fallback: number) => {
    const value = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const pageGap = length('--page-gap', DEFAULT_METRICS.pageGap);
  const marginWidth = length('--margin-column-width', DEFAULT_METRICS.marginWidth);
  if (previous && previous.pageGap === pageGap && previous.marginWidth === marginWidth) return previous;
  return { ...DEFAULT_METRICS, pageGap, marginWidth };
}

const documentKeys = new WeakMap<PDFDocumentProxy, number>();
let lastDocumentKey = 0;

function documentKey(pdf: PDFDocumentProxy): number {
  let key = documentKeys.get(pdf);
  if (key === undefined) {
    key = ++lastDocumentKey;
    documentKeys.set(pdf, key);
  }
  return key;
}
