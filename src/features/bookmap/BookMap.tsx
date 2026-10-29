import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sectionForPage } from '@/lib/pdf/outline';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId, OutlineItem, ReadingLocation } from '@/lib/types';
import { useBookmarksStore } from '../navigation/bookmarksStore';
import { useHistoryStore } from '../navigation/historyStore';
import { formatPageRef, pageLabelFor } from '../navigation/pageLabels';
import { jumpToHighlight } from '../notes/highlightActions';
import { useHighlightUiStore } from '../notes/highlightUi';
import { useHighlightsStore } from '../notes/highlightsStore';
import { useNoteFocusStore } from '../notes/noteFocus';
import { useNotesStore } from '../notes/notesStore';
import { useReaderStore } from '../reader/readerStore';
import { ChapterTabs, ForeEdge } from './ForeEdge';
import {
  chapterIndexAt,
  describeSummary,
  fractionOf,
  keyboardStep,
  layoutMarks,
  locationAt,
  pageAt,
  railChapters,
  summarizePage,
  thumbBox,
} from './geometry';
import { PreviewCard } from './PreviewCard';
import { type MapItem, mapItems, snapAt, snapTargets } from './snap';
import './bookMap.css';

/** Smallest the viewport window is drawn (px). */
const MIN_WINDOW = 12;
/** Pointer travel (px) that turns a press into a scrub. */
const DRAG_THRESHOLD = 4;
/** How far above a note the reader lands, as the sidebar's Notes tab does. */
const JUMP_LEAD = 0.15;

/** The whole book along the reader's right edge. Mounted only while the setting is on. */
export function BookMap() {
  const pdf = useReaderStore((s) => s.pdf);
  const docId = useReaderStore((s) => s.docId);
  const ready = useReaderStore((s) => s.status === 'ready');
  if (!pdf || !docId || !ready || pdf.numPages < 1) return null;
  return <BookMapRail key={docId} pdf={pdf} docId={docId} pageCount={pdf.numPages} />;
}

interface BookMapRailProps {
  pdf: PDFDocumentProxy;
  docId: DocId;
  pageCount: number;
}

/** Where the pointer is along the track (0…1), and whether it is scrubbing. */
type Pointing = { mode: 'hover' | 'drag'; fraction: number } | null;

interface DragState {
  pointerId: number;
  startY: number;
  start: ReadingLocation;
  /** Fraction between the window's top and the pointer, kept while scrubbing. */
  grab: number;
  onWindow: boolean;
  moved: boolean;
}

function BookMapRail({ pdf, docId, pageCount }: BookMapRailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ height: 0, trackTop: 0, trackHeight: 0 });
  const { trackHeight } = size;
  /** The viewport's extent as fractions of the book (before the window's minimum size). */
  const viewRef = useRef({ top: 0, bottom: 0 });

  const outline = useReaderStore((s) => s.outline);
  const pageLabels = useReaderStore((s) => s.pageLabels);
  const currentPage = useReaderStore((s) => s.location.page);
  const chapters = useMemo(() => railChapters(outline, pageCount), [outline, pageCount]);

  const notes = useNotesStore((s) => s.notes);
  const highlights = useHighlightsStore((s) => s.highlights);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const marks = useMemo(
    () => layoutMarks(notes, highlights, bookmarks, pageCount, trackHeight),
    [notes, highlights, bookmarks, pageCount, trackHeight],
  );
  const targets = useMemo(
    () => snapTargets(mapItems(notes, highlights, bookmarks), pageCount, trackHeight),
    [notes, highlights, bookmarks, pageCount, trackHeight],
  );

  const [pointing, setPointing] = useState<Pointing>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const scrubRef = useRef<{ frame: number; target: ReadingLocation | null }>({ frame: 0, target: null });

  // The map stands in for the viewport's scrollbar while it is mounted.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('has-book-map');
    return () => html.classList.remove('has-book-map');
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current!;
    const track = trackRef.current!;
    const measure = () =>
      setSize({ height: root.clientHeight, trackTop: track.offsetTop, trackHeight: track.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // The viewport window follows scrolling without re-rendering the map.
  const updateWindow = useCallback(() => {
    const box = windowRef.current;
    if (!box || trackHeight <= 0) return;
    const { controller, location } = useReaderStore.getState();
    const top = fractionOf(controller?.getLocation() ?? location, pageCount);
    const center = controller ? fractionOf(controller.getVisibleCenter(), pageCount) : top + 0.5 / pageCount;
    const bottom = top + 2 * Math.max(0, center - top);
    viewRef.current = { top, bottom };
    const placed = thumbBox(top, bottom, trackHeight, MIN_WINDOW);
    box.style.transform = `translateY(${placed.y}px)`;
    box.style.height = `${placed.height}px`;
  }, [pageCount, trackHeight]);

  useLayoutEffect(() => {
    updateWindow();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      // Zoom and resizes lay the pages out again first; measure once they have.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(updateWindow);
      });
    };
    const unsubscribe = useReaderStore.subscribe((state, prev) => {
      if (state.location !== prev.location || state.controller !== prev.controller) updateWindow();
      if (state.zoom !== prev.zoom || state.controller !== prev.controller) later();
    });
    const observer = new ResizeObserver(later);
    const main = rootRef.current?.parentElement;
    if (main) observer.observe(main);
    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [updateWindow]);

  // Wheel over the rail scrolls the pages, as it would over a scrollbar.
  useEffect(() => {
    const rail = railRef.current;
    const viewport = rootRef.current?.parentElement?.querySelector<HTMLElement>('.reader__viewport');
    if (!rail || !viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      viewport.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit });
    };
    rail.addEventListener('wheel', onWheel, { passive: true });
    return () => rail.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => () => cancelAnimationFrame(scrubRef.current.frame), []);

  const fractionAt = (clientY: number) => {
    const track = trackRef.current;
    if (!track || trackHeight <= 0) return 0;
    return Math.min(1, Math.max(0, (clientY - track.getBoundingClientRect().top) / trackHeight));
  };

  const scrubTo = useCallback((target: ReadingLocation) => {
    const scrub = scrubRef.current;
    scrub.target = target;
    if (scrub.frame) return;
    scrub.frame = requestAnimationFrame(() => {
      scrub.frame = 0;
      const next = scrub.target;
      scrub.target = null;
      if (next) useReaderStore.getState().controller?.scrollTo(next, { smooth: false });
    });
  }, []);

  const endDrag = useCallback(() => {
    const scrub = scrubRef.current;
    cancelAnimationFrame(scrub.frame);
    scrub.frame = 0;
    scrub.target = null;
    dragRef.current = null;
    setDragging(false);
  }, []);

  // Esc while scrubbing puts the reader back where the scrub began.
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const drag = dragRef.current;
      if (event.key !== 'Escape' || !drag) return;
      event.preventDefault();
      event.stopPropagation();
      endDrag();
      setPointing(null);
      useReaderStore.getState().controller?.scrollTo(drag.start, { smooth: false });
      if (railRef.current?.hasPointerCapture(drag.pointerId))
        railRef.current.releasePointerCapture(drag.pointerId);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dragging, endDrag]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const controller = useReaderStore.getState().controller;
    if (!controller) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const fraction = fractionAt(event.clientY);
    const box = windowRef.current?.getBoundingClientRect();
    const onWindow = !!box && event.clientY >= box.top - 2 && event.clientY <= box.bottom + 2;
    const view = viewRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      start: controller.getLocation(),
      grab: onWindow ? Math.min(Math.max(0, fraction - view.top), view.bottom - view.top) : 0,
      onWindow,
      moved: false,
    };
    setCursor(null);
    setPointing({ mode: 'hover', fraction });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const fraction = fractionAt(event.clientY);
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (!drag.moved && Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      if (!drag.moved) {
        drag.moved = true;
        setDragging(true);
      }
      scrubTo(locationAt(fraction - drag.grab, pageCount));
      setPointing({ mode: 'drag', fraction });
      return;
    }
    if (event.pointerType !== 'touch') setPointing({ mode: 'hover', fraction });
  };

  const finishPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const controller = useReaderStore.getState().controller;
    const fraction = fractionAt(event.clientY);
    endDrag();
    if (!controller) return;
    if (!drag.moved) {
      const target = snapAt(targets, fraction * trackHeight);
      if (target) jumpToItem(target.items[0]);
      // A click on the window is a click on where you already are.
      else if (!drag.onWindow)
        useHistoryStore.getState().jumpTo({ page: pageAt(fraction, pageCount), offset: 0 });
      return;
    }
    // A scrub never snaps: where you let go is where you stay.
    controller.scrollTo(locationAt(fraction - drag.grab, pageCount), { smooth: false });
    useHistoryStore.getState().recordJump(drag.start);
    setPointing(event.pointerType === 'mouse' ? { mode: 'hover', fraction } : null);
  };

  /** The press ended without a release over the rail (touch cancelled, capture lost): stay, but remember the way back. */
  const abandonPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    endDrag();
    if (drag.moved) useHistoryStore.getState().recordJump(drag.start);
    setPointing(null);
  };

  const value = cursor ?? currentPage;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || dragRef.current) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      useHistoryStore.getState().jumpTo({ page: value, offset: 0 });
      setCursor(null);
      setKeyboardFocus(true);
      return;
    }
    if (event.key === 'Escape') {
      if (cursor !== null && cursor !== currentPage) {
        event.preventDefault();
        setCursor(null);
      }
      return;
    }
    const next = keyboardStep(event.key, event.shiftKey, value, pageCount, chapters);
    if (next === null) return;
    event.preventDefault();
    setCursor(next);
    setKeyboardFocus(true);
  };

  const labelOf = (page: number) => pageLabelFor(pageLabels, page);
  const section = sectionFor(outline, value);
  const valueSummary = describeSummary(summarizePage(value, notes, highlights, bookmarks));
  const valueText = [`${formatPageRef(pageLabels, value)} of ${pageCount}`, section, valueSummary]
    .filter(Boolean)
    .join(', ');

  // What the preview card shows, and where it points (px from the top of the track).
  const snapped = pointing?.mode === 'hover' ? snapAt(targets, pointing.fraction * trackHeight) : null;
  let cardPage: number | null = null;
  let cardY = 0;
  if (snapped) {
    cardPage = snapped.items[0].page;
    cardY = (snapped.top + snapped.bottom) / 2;
  } else if (pointing) {
    cardPage = pageAt(pointing.fraction, pageCount);
    cardY = pointing.fraction * trackHeight;
  } else if (keyboardFocus) {
    cardPage = value;
    cardY = ((value - 0.5) / pageCount) * trackHeight;
  }

  const className = ['book-map', dragging && 'is-dragging', keyboardFocus && 'is-keyboard']
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} className={className}>
      <div
        ref={railRef}
        className="book-map__rail"
        role="slider"
        tabIndex={0}
        aria-label="Book map"
        aria-orientation="vertical"
        aria-valuemin={1}
        aria-valuemax={pageCount}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPress}
        onPointerCancel={abandonPress}
        onLostPointerCapture={abandonPress}
        onPointerLeave={() => {
          if (!dragRef.current) setPointing(null);
        }}
        // Like a scrollbar, the rail doesn't take focus from the pages when clicked.
        onMouseDown={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onFocus={(event) => setKeyboardFocus(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => {
          setKeyboardFocus(false);
          setCursor(null);
        }}
      >
        <div ref={trackRef} className="book-map__track">
          {trackHeight > 0 && (
            <>
              <ForeEdge chapters={chapters} pageCount={pageCount} height={trackHeight} marks={marks} />
              <ChapterTabs
                chapters={chapters}
                pageCount={pageCount}
                height={trackHeight}
                currentChapter={chapterIndexAt(chapters, currentPage)}
              />
            </>
          )}
          {cardPage !== null && !snapped && !dragging && (
            <div
              className="book-map__probe"
              style={{
                top: ((cardPage - 1) / pageCount) * trackHeight,
                height: Math.max(2, trackHeight / pageCount),
              }}
            />
          )}
          <div ref={windowRef} className="book-map__window" />
          {snapped && (
            <div
              className="book-map__lens"
              style={{ top: snapped.top, height: snapped.bottom - snapped.top }}
            />
          )}
        </div>
      </div>
      {cardPage !== null && trackHeight > 0 && (
        <PreviewCard
          pdf={pdf}
          docId={docId}
          page={cardPage}
          pageCount={pageCount}
          labelOf={labelOf}
          section={cardPage === value ? section : sectionFor(outline, cardPage)}
          summary={summarizePage(cardPage, notes, highlights, bookmarks)}
          notes={notes.filter((note) => note.page === cardPage)}
          highlights={highlights.filter((highlight) => highlight.page === cardPage)}
          snapped={snapped?.items ?? null}
          y={size.trackTop + cardY}
          boundsHeight={size.height}
          current={cardPage === currentPage && !dragging}
          compact={dragging}
        />
      )}
    </div>
  );
}

/** Goes to an annotation the way the sidebar's Notes and Bookmarks tabs do: recorded in history, and flashed. */
function jumpToItem(item: MapItem): void {
  if (item.kind === 'highlight') {
    jumpToHighlight(item.highlight);
    return;
  }
  const offset = item.kind === 'note' ? Math.max(0, item.y - JUMP_LEAD) : 0;
  useHistoryStore.getState().jumpTo({ page: item.page, offset });
  if (item.kind !== 'note') return;
  useNoteFocusStore.getState().pulseNote(item.id);
  if (item.highlight) useHighlightUiStore.getState().pulse(item.highlight.id);
}

const sectionCaches = new WeakMap<OutlineItem[], Map<number, string | null>>();

/** `sectionForPage`, memoised per outline (it is needed on every pointer move). */
function sectionFor(outline: OutlineItem[], page: number): string | null {
  let cache = sectionCaches.get(outline);
  if (!cache) {
    cache = new Map();
    sectionCaches.set(outline, cache);
  }
  let section = cache.get(page);
  if (section === undefined) {
    section = sectionForPage(outline, page);
    cache.set(page, section);
  }
  return section;
}
