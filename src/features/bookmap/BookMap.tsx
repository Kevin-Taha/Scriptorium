import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { sectionForPage } from '@/lib/pdf/outline';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId, ReadingLocation } from '@/lib/types';
import { clamp } from '@/lib/util';
import { useBookmarksStore } from '../navigation/bookmarksStore';
import { buildChapterSpans, findCurrentChapter } from '../navigation/chapterProgressModel';
import { useHistoryStore } from '../navigation/historyStore';
import { formatPageRef } from '../navigation/pageLabels';
import { jumpToHighlight } from '../notes/highlightActions';
import { useHighlightUiStore } from '../notes/highlightUi';
import { useHighlightsStore } from '../notes/highlightsStore';
import { useNoteFocusStore } from '../notes/noteFocus';
import { useNotesStore } from '../notes/notesStore';
import { useReaderStore } from '../reader/readerStore';
import { ForeEdge } from './ForeEdge';
import {
  describePage,
  fractionOf,
  keyboardStep,
  layoutMarks,
  locationAt,
  type MapItem,
  mapItems,
  snapAt,
  snapTargets,
  thumbBox,
} from './geometry';
import { PreviewCard } from './PreviewCard';
import './bookMap.css';

/** Smallest the viewport window is drawn (px). */
const MIN_WINDOW = 12;
/** Pointer travel (px) that turns a press into a scrub. */
const DRAG_THRESHOLD = 4;
/** How far above a note the reader lands, as from the sidebar's Notes tab. */
const JUMP_LEAD = 0.15;

/** The whole book along the reader's right edge, standing in for its scrollbar. */
export function BookMap() {
  const pdf = useReaderStore((s) => s.pdf);
  const docId = useReaderStore((s) => s.docId);
  const ready = useReaderStore((s) => s.status === 'ready');
  if (!pdf || !docId || !ready) return null;
  return <BookMapRail key={docId} pdf={pdf} docId={docId} pageCount={pdf.numPages} />;
}

interface Drag {
  pointerId: number;
  startY: number;
  start: ReadingLocation;
  /** From the view's top to the pointer (fraction of the book), kept while scrubbing. */
  grab: number;
  onWindow: boolean;
  moved: boolean;
}

function BookMapRail({ pdf, docId, pageCount }: { pdf: PDFDocumentProxy; docId: DocId; pageCount: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const [track, setTrack] = useState({ top: 0, height: 0 });

  const outline = useReaderStore((s) => s.outline);
  const pageLabels = useReaderStore((s) => s.pageLabels);
  const currentPage = useReaderStore((s) => s.location.page);
  const notes = useNotesStore((s) => s.notes);
  const highlights = useHighlightsStore((s) => s.highlights);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const chapters = useMemo(() => buildChapterSpans(outline, pageCount), [outline, pageCount]);
  const marks = useMemo(
    () => layoutMarks(notes, highlights, bookmarks, pageCount, track.height),
    [notes, highlights, bookmarks, pageCount, track.height],
  );
  const targets = useMemo(
    () => snapTargets(mapItems(notes, highlights, bookmarks), pageCount, track.height),
    [notes, highlights, bookmarks, pageCount, track.height],
  );

  /** Fraction of the book under a hovering or scrubbing pointer. */
  const [pointer, setPointer] = useState<number | null>(null);
  /** A page chosen with the keyboard but not gone to yet. */
  const [cursor, setCursor] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('has-book-map');
    return () => html.classList.remove('has-book-map');
  }, []);

  useLayoutEffect(() => {
    const element = trackRef.current!;
    const measure = () => setTrack({ top: element.offsetTop, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The window follows scrolling without re-rendering the map.
  useLayoutEffect(() => {
    const update = () => {
      const { controller, location } = useReaderStore.getState();
      const top = fractionOf(controller?.getLocation() ?? location, pageCount);
      const center = controller ? fractionOf(controller.getVisibleCenter(), pageCount) : top;
      const box = thumbBox(top, Math.min(1, 2 * center - top), track.height, MIN_WINDOW);
      windowRef.current!.style.transform = `translateY(${box.y}px)`;
      windowRef.current!.style.height = `${box.height}px`;
    };
    let frame = 0;
    // Zoom and resizes lay the pages out again first; measure once they have.
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(update);
      });
    };
    update();
    const unsubscribe = useReaderStore.subscribe((state, prev) => {
      if (state.location !== prev.location || state.controller !== prev.controller) update();
      if (state.zoom !== prev.zoom || state.controller !== prev.controller) later();
    });
    const observer = new ResizeObserver(later);
    observer.observe(rootRef.current!.parentElement!);
    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [pageCount, track.height]);

  // Esc while scrubbing puts the reader back where the scrub began.
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const drag = dragRef.current;
      if (event.key !== 'Escape' || !drag) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = null;
      setDragging(false);
      setPointer(null);
      useReaderStore.getState().controller?.scrollTo(drag.start, { smooth: false });
      railRef.current!.releasePointerCapture(drag.pointerId);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dragging]);

  const fractionAt = (clientY: number) =>
    clamp((clientY - trackRef.current!.getBoundingClientRect().top) / track.height, 0, 1);
  const scrubTo = (fraction: number) =>
    useReaderStore.getState().controller?.scrollTo(locationAt(fraction, pageCount), { smooth: false });
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const controller = useReaderStore.getState().controller;
    if (event.button !== 0 || !controller) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const fraction = fractionAt(event.clientY);
    const start = controller.getLocation();
    const box = windowRef.current!.getBoundingClientRect();
    const onWindow = event.clientY >= box.top - 2 && event.clientY <= box.bottom + 2;
    const grab = onWindow ? fraction - fractionOf(start, pageCount) : 0;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      start,
      grab,
      onWindow,
      moved: false,
    };
    setCursor(null);
    setPointer(fraction);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const fraction = fractionAt(event.clientY);
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (!drag.moved && Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      setDragging(true);
      scrubTo(fraction - drag.grab);
    } else if (event.pointerType === 'touch') return;
    setPointer(fraction);
  };

  const finishPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    endDrag();
    const fraction = fractionAt(event.clientY);
    if (drag.moved) {
      // A scrub never snaps: where you let go is where you stay, with one way back.
      scrubTo(fraction - drag.grab);
      useHistoryStore.getState().recordJump(drag.start);
      setPointer(event.pointerType === 'mouse' ? fraction : null);
      return;
    }
    const target = snapAt(targets, fraction * track.height);
    if (target) jumpToItem(target.items[0]);
    // A click on the window is a click on where you already are.
    else if (!drag.onWindow)
      useHistoryStore.getState().jumpTo({ page: locationAt(fraction, pageCount).page, offset: 0 });
  };

  /** The press ended without a release over the rail (touch cancelled, capture lost): stay, keeping the way back. */
  const abandonPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    endDrag();
    if (drag.moved) useHistoryStore.getState().recordJump(drag.start);
    setPointer(null);
  };

  // Wheel over the rail scrolls the pages, as over a scrollbar.
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const viewport = rootRef.current!.parentElement!.querySelector('.reader__viewport');
    if (!viewport || event.ctrlKey || event.metaKey) return;
    const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    viewport.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit });
  };

  const value = cursor ?? currentPage;
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || dragRef.current) return;
    let next: number | null = null;
    if (event.key === 'Enter' || event.key === ' ') {
      useHistoryStore.getState().jumpTo({ page: value, offset: 0 });
    } else if (event.key === 'Escape') {
      // Drops a page chosen but not gone to; otherwise Esc is left to others.
      if (cursor === null || cursor === currentPage) return;
    } else {
      next = keyboardStep(event.key, event.shiftKey, value, pageCount, chapters);
      if (next === null) return;
    }
    event.preventDefault();
    setCursor(next);
    setKeyboard(true);
  };

  const valueText = useMemo(
    () =>
      [
        `${formatPageRef(pageLabels, value)} of ${pageCount}`,
        sectionForPage(outline, value),
        describePage(value, notes, highlights, bookmarks),
      ]
        .filter(Boolean)
        .join(', '),
    [value, pageLabels, pageCount, outline, notes, highlights, bookmarks],
  );

  // What the preview card shows, and where on the track it points.
  const snapped = pointer === null || dragging ? null : snapAt(targets, pointer * track.height);
  let card: { page: number; y: number } | null = null;
  if (snapped) card = { page: snapped.items[0].page, y: (snapped.top + snapped.bottom) / 2 };
  else if (pointer !== null) card = { page: locationAt(pointer, pageCount).page, y: pointer * track.height };
  else if (keyboard) card = { page: value, y: ((value - 0.5) / pageCount) * track.height };

  return (
    <div
      ref={rootRef}
      className={`book-map${dragging ? ' is-dragging' : ''}${keyboard ? ' is-keyboard' : ''}`}
    >
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
          if (!dragRef.current) setPointer(null);
        }}
        // Like a scrollbar, the rail doesn't take focus from the pages when clicked.
        onMouseDown={(event) => event.preventDefault()}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onFocus={(event) => setKeyboard(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => {
          setKeyboard(false);
          setCursor(null);
        }}
      >
        <div ref={trackRef} className="book-map__track">
          {track.height > 0 && (
            <ForeEdge
              chapters={chapters}
              current={findCurrentChapter(chapters, currentPage)}
              pageCount={pageCount}
              height={track.height}
              marks={marks}
            />
          )}
          <div ref={windowRef} className="book-map__window" />
          {/* Rings what the pointer has snapped to, so the pull is visible before you click. */}
          {snapped && (
            <div
              className="book-map__lens"
              style={{ top: snapped.top, height: snapped.bottom - snapped.top }}
            />
          )}
        </div>
      </div>
      {card && (
        <PreviewCard
          pdf={pdf}
          docId={docId}
          page={card.page}
          pageCount={pageCount}
          snapped={snapped?.items ?? null}
          y={track.top + card.y}
          compact={dragging}
        />
      )}
    </div>
  );
}

/** Goes to an annotation as the sidebar does: recorded in history, and flashed. */
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
