import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useBookmarksStore } from '@/features/navigation/bookmarksStore';
import { isSamePlace, useHistoryStore } from '@/features/navigation/historyStore';
import { formatPageRef, pageLabelFor } from '@/features/navigation/pageLabels';
import { useHighlightsStore } from '@/features/notes/highlightsStore';
import { useNotesStore } from '@/features/notes/notesStore';
import { useReaderStore } from '@/features/reader/readerStore';
import { sectionForPage } from '@/lib/pdf/outline';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { DocId, Highlight, MarginNote, OutlineItem, ReadingLocation } from '@/lib/types';
import {
  chapterIndexAt,
  fractionOf,
  keyboardStep,
  layoutMarks,
  locationAt,
  markInputs,
  pageAt,
  railChapters,
  summarizePages,
  thumbBox,
  type RailChapter,
  type RailMark,
} from './geometry';
import { PreviewCard } from './PreviewCard';
import { decodeRuns, flushReadTrail, markPagesRead, useReadTrailStore } from './readTrail';

/** Breathing room above and below the track inside the rail (px). */
const TRACK_INSET = 10;
/** Width the map is drawn at; the rail reveals its right-hand part at rest. */
const MAP_WIDTH = 56;
/** The fore-edge strip: width and distance from the rail's right edge (px). */
const STRIP_WIDTH = 10;
const STRIP_RIGHT = 7;
const MIN_THUMB = 12;
/** Pointer travel (px) that turns a press into a scrub. */
const DRAG_THRESHOLD = 4;
/** Chapter tabs closer than this (px) are skipped (tabs are 16px tall). */
const LABEL_GAP = 18;
/** Page boundaries are ruled on the strip while pages are at least this tall (px). */
const PAGE_RULE_MIN = 7;
/** Mirrors the history store's cap. */
const MAX_HISTORY = 100;
/** A page that stays at the top of the viewport this long counts as read. */
const DWELL_MS = 6000;

const STRIP_X = MAP_WIDTH - STRIP_RIGHT - STRIP_WIDTH;

/** Mounted in the reader while the experiment is on. */
export function MinimapRail() {
  const pdf = useReaderStore((s) => s.pdf);
  const docId = useReaderStore((s) => s.docId);
  const ready = useReaderStore((s) => s.status === 'ready');
  if (!pdf || !docId || !ready || pdf.numPages < 1) return null;
  return <Minimap key={docId} pdf={pdf} docId={docId} pageCount={pdf.numPages} />;
}

interface MinimapProps {
  pdf: PDFDocumentProxy;
  docId: DocId;
  pageCount: number;
}

type Pointing = { mode: 'hover' | 'drag'; fraction: number } | null;

interface DragState {
  pointerId: number;
  startY: number;
  start: ReadingLocation;
  /** Fraction between the thumb's top and the pointer, kept while scrubbing. */
  grab: number;
  onThumb: boolean;
  moved: boolean;
}

function Minimap({ pdf, docId, pageCount }: MinimapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const trackHeight = Math.max(0, height - 2 * TRACK_INSET);
  const trackHeightRef = useRef(trackHeight);
  trackHeightRef.current = trackHeight;
  /** Thumb extent as fractions of the book (true viewport window, before min-size padding). */
  const windowRef = useRef({ top: 0, bottom: 0 });

  const outline = useReaderStore((s) => s.outline);
  const pageLabels = useReaderStore((s) => s.pageLabels);
  const currentPage = useReaderStore((s) => s.location.page);
  const chapters = useMemo(() => railChapters(outline, pageCount), [outline, pageCount]);
  const currentChapter = chapterIndexAt(chapters, currentPage);

  const notes = useNotesStore((s) => s.notes);
  const highlights = useHighlightsStore((s) => s.highlights);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const bookNotes = useMemo(() => notes.filter((n) => n.docId === docId), [notes, docId]);
  const bookHighlights = useMemo(() => highlights.filter((h) => h.docId === docId), [highlights, docId]);
  const bookBookmarks = useMemo(() => bookmarks.filter((b) => b.docId === docId), [bookmarks, docId]);
  const marks = useMemo(
    () => layoutMarks(markInputs(bookNotes, bookHighlights, bookBookmarks, pageCount), trackHeight),
    [bookNotes, bookHighlights, bookBookmarks, pageCount, trackHeight],
  );
  const summaries = useMemo(
    () => summarizePages(bookNotes, bookHighlights, bookBookmarks),
    [bookNotes, bookHighlights, bookBookmarks],
  );
  const notesByPage = useMemo(() => groupByPage(bookNotes), [bookNotes]);
  const highlightsByPage = useMemo(() => groupByPage(bookHighlights), [bookHighlights]);

  const trail = useReadTrailStore((s) => s.trails[docId]);
  const readRuns = useMemo(() => decodeRuns(trail), [trail]);

  const [pointing, setPointing] = useState<Pointing>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const scrubRef = useRef<{ frame: number; target: ReadingLocation | null }>({ frame: 0, target: null });

  // The rail stands in for the viewport's scrollbar while it is mounted.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('exp-minimap');
    return () => html.classList.remove('exp-minimap');
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current!;
    const measure = () => setHeight(root.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // The thumb follows scrolling without re-rendering the map.
  const updateThumb = useCallback(() => {
    const thumb = thumbRef.current;
    const track = trackHeightRef.current;
    const { controller, location } = useReaderStore.getState();
    if (!thumb || track <= 0) return;
    const top = fractionOf(controller?.getLocation() ?? location, pageCount);
    const center = controller ? fractionOf(controller.getVisibleCenter(), pageCount) : top + 0.5 / pageCount;
    const bottom = top + 2 * Math.max(0, center - top);
    windowRef.current = { top, bottom };
    const box = thumbBox(top, bottom, track, MIN_THUMB);
    thumb.style.transform = `translateY(${box.y}px)`;
    thumb.style.height = `${box.height}px`;
  }, [pageCount]);

  useLayoutEffect(() => {
    updateThumb();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      // Zoom and resizes re-lay the pages out first; measure once they have.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(updateThumb);
      });
    };
    const unsubscribe = useReaderStore.subscribe((state, prev) => {
      if (state.location !== prev.location || state.controller !== prev.controller) updateThumb();
      if (state.zoom !== prev.zoom || state.controller !== prev.controller) later();
    });
    const main = rootRef.current?.parentElement;
    const observer = new ResizeObserver(later);
    if (main) observer.observe(main);
    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [updateThumb, trackHeight]);

  // Reading trail: the top page counts as read once it has stayed put for a while.
  useEffect(() => {
    let page = useReaderStore.getState().location.page;
    let since = Date.now();
    const unsubscribe = useReaderStore.subscribe((state) => {
      if (state.location.page !== page) {
        page = state.location.page;
        since = Date.now();
      }
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || dragRef.current) return;
      if (Date.now() - since < DWELL_MS) return;
      const { controller } = useReaderStore.getState();
      const center = controller?.getVisibleCenter().page ?? page;
      markPagesRead(docId, center === page ? [page] : [page, center]);
    }, 1000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      flushReadTrail();
    };
  }, [docId]);

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

  const fractionAt = useCallback((clientY: number) => {
    const root = rootRef.current;
    const track = trackHeightRef.current;
    if (!root || track <= 0) return 0;
    const y = clientY - root.getBoundingClientRect().top - TRACK_INSET;
    return Math.min(1, Math.max(0, y / track));
  }, []);

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
      if (event.key !== 'Escape') return;
      const drag = dragRef.current;
      if (!drag) return;
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
    const thumb = thumbRef.current?.getBoundingClientRect();
    const onThumb = !!thumb && event.clientY >= thumb.top - 2 && event.clientY <= thumb.bottom + 2;
    const view = windowRef.current;
    const grab = onThumb ? Math.min(Math.max(0, fraction - view.top), view.bottom - view.top) : 0;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      start: controller.getLocation(),
      grab,
      onThumb,
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
    if (event.pointerType === 'touch') return;
    setPointing({ mode: 'hover', fraction });
  };

  const finishPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const controller = useReaderStore.getState().controller;
    const fraction = fractionAt(event.clientY);
    endDrag();
    if (!controller) return;
    if (!drag.moved) {
      // A click on the thumb is a click on where you already are.
      if (!drag.onThumb) useHistoryStore.getState().jumpTo({ page: pageAt(fraction, pageCount), offset: 0 });
      return;
    }
    controller.scrollTo(locationAt(fraction - drag.grab, pageCount), { smooth: false });
    recordJump(drag.start, controller.getLocation());
    setPointing(event.pointerType === 'mouse' ? { mode: 'hover', fraction } : null);
  };

  /** The press ended without a release over the rail (touch cancelled, capture lost): stay, but remember the way back. */
  const abandonPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    endDrag();
    const controller = useReaderStore.getState().controller;
    if (drag.moved && controller) recordJump(drag.start, controller.getLocation());
    setPointing(null);
  };

  const onPointerLeave = () => {
    if (!dragRef.current) setPointing(null);
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

  const section = sectionFor(outline, value);
  const valueText = `${formatPageRef(pageLabels, value)} of ${pageCount}${section ? `, ${section}` : ''}`;

  // What the preview card shows, and where it points.
  let cardPage: number | null = null;
  let cardY = 0;
  if (pointing) {
    cardPage = pageAt(pointing.fraction, pageCount);
    cardY = TRACK_INSET + pointing.fraction * trackHeight;
  } else if (keyboardFocus) {
    cardPage = value;
    cardY = TRACK_INSET + ((value - 0.5) / pageCount) * trackHeight;
  }
  const cardSection = cardPage === value ? section : sectionFor(outline, cardPage ?? value);

  const className = ['minimap', dragging && 'is-dragging', keyboardFocus && 'is-keyboard']
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} className={className}>
      <div
        ref={railRef}
        className="minimap__rail"
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
        onPointerLeave={onPointerLeave}
        // Like a scrollbar, the rail doesn't take focus from the pages when clicked.
        onMouseDown={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onFocus={(event) => setKeyboardFocus(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => {
          setKeyboardFocus(false);
          setCursor(null);
        }}
      >
        {trackHeight > 0 && (
          <>
            <RailMap
              chapters={chapters}
              pageCount={pageCount}
              height={trackHeight}
              marks={marks}
              readRuns={readRuns}
            />
            <ChapterTabs
              chapters={chapters}
              pageCount={pageCount}
              height={trackHeight}
              currentChapter={currentChapter}
            />
          </>
        )}
        {cardPage !== null && trackHeight > 0 && (
          <div
            className="minimap__probe"
            style={{
              top: TRACK_INSET + ((cardPage - 1) / pageCount) * trackHeight,
              height: Math.max(2, trackHeight / pageCount),
            }}
          />
        )}
        <div ref={thumbRef} className="minimap__thumb" style={{ top: TRACK_INSET }} />
      </div>
      {cardPage !== null && height > 0 && (
        <PreviewCard
          pdf={pdf}
          docId={docId}
          page={cardPage}
          pageCount={pageCount}
          label={pageLabelFor(pageLabels, cardPage)}
          section={cardSection}
          summary={summaries.get(cardPage)}
          notes={notesByPage.get(cardPage) ?? NONE}
          highlights={highlightsByPage.get(cardPage) ?? NONE}
          y={cardY}
          boundsHeight={height}
          current={cardPage === currentPage && !dragging}
          compact={dragging}
        />
      )}
    </div>
  );
}

const NONE: never[] = [];

/** Same bookkeeping as `jumpTo`, minus the scroll: a scrub has already brought the reader here. */
function recordJump(from: ReadingLocation, to: ReadingLocation): void {
  if (isSamePlace(from, to)) return;
  useHistoryStore.setState((s) => ({
    back: [...s.back, from].slice(-MAX_HISTORY),
    forward: [],
    returnTarget: from,
  }));
}

function groupByPage<T extends MarginNote | Highlight>(items: readonly T[]): Map<number, T[]> {
  const pages = new Map<number, T[]>();
  for (const item of items) {
    const list = pages.get(item.page);
    if (list) list.push(item);
    else pages.set(item.page, [item]);
  }
  return pages;
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

// ------------------------------------------------------------------- drawing

interface RailMapProps {
  chapters: RailChapter[];
  pageCount: number;
  height: number;
  marks: RailMark[];
  readRuns: [number, number][];
}

/** The fore-edge: page rules, chapter dividers, the read trail and every annotation, as one SVG. */
const RailMap = memo(function RailMap({ chapters, pageCount, height, marks, readRuns }: RailMapProps) {
  const yOfPage = (page: number) => ((page - 1) / pageCount) * height;
  const perPage = height / pageCount;
  const right = STRIP_X + STRIP_WIDTH;

  let rules = '';
  if (perPage >= PAGE_RULE_MIN) {
    for (let page = 2; page <= pageCount; page++)
      rules += `M${STRIP_X} ${round(yOfPage(page))}h${STRIP_WIDTH}`;
  }
  let separators = '';
  for (const chapter of chapters) {
    if (chapter.startPage > 1)
      separators += `M${STRIP_X - 2} ${round(yOfPage(chapter.startPage))}h${STRIP_WIDTH + 2}`;
  }
  let read = '';
  for (const [first, last] of readRuns) {
    if (first > pageCount) continue;
    const top = round(yOfPage(first));
    const bottom = round(yOfPage(Math.min(last, pageCount) + 1));
    read += `M${STRIP_X} ${top}h${STRIP_WIDTH}V${Math.max(bottom, top + 1)}h${-STRIP_WIDTH}Z`;
  }

  return (
    <svg
      className="minimap__map"
      width={MAP_WIDTH}
      height={height}
      viewBox={`0 0 ${MAP_WIDTH} ${height}`}
      style={{ top: TRACK_INSET }}
      aria-hidden="true"
      focusable="false"
    >
      <rect className="minimap__paper" x={STRIP_X} y={0} width={STRIP_WIDTH} height={height} rx={2} />
      {read && <path className="minimap__read" d={read} />}
      {rules && <path className="minimap__rules" d={rules} />}
      {separators && <path className="minimap__separators" d={separators} />}
      <rect
        className="minimap__edge"
        x={STRIP_X + 0.5}
        y={0.5}
        width={STRIP_WIDTH - 1}
        height={Math.max(0, height - 1)}
        rx={1.5}
      />
      {marks.map((mark) => {
        const key = `${mark.kind}:${mark.y}`;
        if (mark.kind === 'highlight') {
          return (
            <rect
              key={key}
              className="minimap__highlight"
              data-note-color={mark.color}
              x={STRIP_X + 1}
              y={mark.y - 1}
              width={STRIP_WIDTH - 2}
              height={2}
              rx={0.5}
            />
          );
        }
        if (mark.kind === 'note') {
          return (
            <circle
              key={key}
              className="minimap__note"
              data-note-color={mark.color}
              cx={STRIP_X + STRIP_WIDTH / 2}
              cy={mark.y}
              r={2.6}
            />
          );
        }
        // A bookmark ribbon tucked into the fore-edge, its notched tail sticking out.
        const y = Math.max(0, mark.y);
        return <path key={key} className="minimap__ribbon" d={`M${right - 3} ${y}h8l-2 2.5l2 2.5h-8z`} />;
      })}
    </svg>
  );
});

interface ChapterTabsProps {
  chapters: RailChapter[];
  pageCount: number;
  height: number;
  currentChapter: number;
}

/** Chapter numbers, revealed beside the strip when the rail opens — a thumb index. */
const ChapterTabs = memo(function ChapterTabs({
  chapters,
  pageCount,
  height,
  currentChapter,
}: ChapterTabsProps) {
  let lastY = Number.NEGATIVE_INFINITY;
  return (
    <div className="minimap__tabs" aria-hidden="true">
      {chapters.map((chapter, index) => {
        if (!chapter.label) return null;
        const top = ((chapter.startPage - 1) / pageCount) * height;
        const bottom = ((Math.min(chapter.endPage, pageCount + 1) - 1) / pageCount) * height;
        const y = bottom - top >= 18 ? top + 9 : top + (bottom - top) / 2;
        if (y - lastY < LABEL_GAP && index !== currentChapter) return null;
        lastY = y;
        return (
          <span
            key={`${chapter.startPage}:${chapter.title}`}
            className={`minimap__tab${index === currentChapter ? ' is-current' : ''}`}
            style={{ top: TRACK_INSET + y }}
          >
            {chapter.label}
          </span>
        );
      })}
    </div>
  );
});

function round(value: number): number {
  return Math.round(value * 2) / 2;
}
