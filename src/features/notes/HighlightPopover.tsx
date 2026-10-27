import { useEffect, useRef } from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { addNoteForHighlight, deleteHighlightWithUndo } from './highlightActions';
import { highlightAt } from './highlightRects';
import { useHighlightUiStore } from './highlightUi';
import { useHighlight, useHighlightsStore } from './highlightsStore';
import { useFloatingPosition } from './floatingPosition';
import { NoteSwatches } from './NoteSwatches';
import { useNotesStore } from './notesStore';
import './highlights.css';

/** A click that moves further than this between press and release is a drag, not a click. */
const CLICK_SLOP_PX = 4;
/** Clicks land a hair outside the glyph boxes; forgive a pixel or two. */
const HIT_SLACK_PX = 2;
const IGNORED_TARGETS = 'a, button, input, textarea, select, .page-sheet__link';

interface HighlightHit {
  id: string;
  /** Viewport box around all of the highlight's lines. */
  extent: { left: number; top: number; right: number; bottom: number };
}

/** Finds the highlight drawn under a viewport point, from the stored rectangles. */
function highlightUnder(target: EventTarget | null, clientX: number, clientY: number): HighlightHit | null {
  const sheet = target instanceof Element ? target.closest<HTMLElement>('.page-sheet') : null;
  if (!sheet) return null;
  const page = Number(sheet.dataset.page);
  const pageHighlights = useHighlightsStore.getState().highlights.filter((h) => h.page === page);
  if (pageHighlights.length === 0) return null;

  const bounds = sheet.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const hit = highlightAt(
    pageHighlights,
    (clientX - bounds.left) / bounds.width,
    (clientY - bounds.top) / bounds.height,
    HIT_SLACK_PX / bounds.height,
  );
  if (!hit) return null;
  const rects = hit.highlight.rects;
  return {
    id: hit.highlight.id,
    extent: {
      left: bounds.left + Math.min(...rects.map((r) => r.x)) * bounds.width,
      right: bounds.left + Math.max(...rects.map((r) => r.x + r.w)) * bounds.width,
      top: bounds.top + Math.min(...rects.map((r) => r.y)) * bounds.height,
      bottom: bounds.top + Math.max(...rects.map((r) => r.y + r.h)) * bounds.height,
    },
  };
}

/**
 * Makes highlights clickable without taking pointer events from the text under
 * them: it hit-tests the pointer against the stored rectangles. Hovering deepens
 * a highlight; a plain click (no drag, no selection) opens its popover to change
 * colour, write a linked note, or delete it.
 */
export function HighlightPopover() {
  const activeId = useHighlightUiStore((s) => s.activeId);
  const anchor = useHighlightUiStore((s) => s.anchor);
  const highlight = useHighlight(activeId ?? undefined);
  const hasNote = useNotesStore((s) =>
    highlight ? s.notes.some((n) => n.highlightId === highlight.id) : false,
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = highlight !== undefined;

  useFloatingPosition(popoverRef, open ? anchor : null, open);

  useEffect(() => {
    const ui = useHighlightUiStore.getState;
    let pressedAt: { x: number; y: number } | null = null;
    let justClosedId: string | null = null;
    let frame = 0;

    const onPointerDown = (event: PointerEvent) => {
      pressedAt = { x: event.clientX, y: event.clientY };
      const { activeId: current, closePopover } = ui();
      justClosedId = null;
      if (current && !popoverRef.current?.contains(event.target as Node)) {
        // Pressing the open highlight again closes it rather than reopening it on click.
        justClosedId = current;
        closePopover();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) return;
      const { clientX, clientY, target } = event;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        ui().setHover(highlightUnder(target, clientX, clientY)?.id ?? null),
      );
    };

    const onClick = (event: MouseEvent) => {
      const moved = pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);
      pressedAt = null;
      if (event.button !== 0 || (moved !== null && moved > CLICK_SLOP_PX)) return;
      if (window.getSelection()?.isCollapsed === false) return;
      if (event.target instanceof Element && event.target.closest(IGNORED_TARGETS)) return;
      const hit = highlightUnder(event.target, event.clientX, event.clientY);
      if (!hit) return;
      if (hit.id === justClosedId) {
        justClosedId = null;
        return;
      }
      ui().openPopover(hit.id, {
        x: (hit.extent.left + hit.extent.right) / 2,
        top: hit.extent.top,
        bottom: hit.extent.bottom,
      });
    };

    const close = () => ui().closePopover();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onSelectionChange = () => {
      if (window.getSelection()?.isCollapsed === false) close();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ui().setHover(null);
      close();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('scroll', close, true);
    };
  }, []);

  if (!highlight) return null;

  return (
    <div
      ref={popoverRef}
      className="selection-popover highlight-popover"
      role="toolbar"
      aria-label="Highlight actions"
    >
      <NoteSwatches
        label="Highlight colour"
        value={highlight.color}
        onChange={(color) => useHighlightsStore.getState().setColor(highlight.id, color)}
      />
      <span className="selection-popover__divider" aria-hidden="true" />
      <button
        type="button"
        className="selection-popover__action"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          useHighlightUiStore.getState().closePopover();
          addNoteForHighlight(highlight);
        }}
      >
        <MessageSquarePlus aria-hidden="true" />
        {hasNote ? 'Open note' : 'Add note'}
      </button>
      <button
        type="button"
        className="selection-popover__icon-button tooltip"
        data-tooltip="Delete highlight"
        aria-label="Delete highlight"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => deleteHighlightWithUndo(highlight)}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}
