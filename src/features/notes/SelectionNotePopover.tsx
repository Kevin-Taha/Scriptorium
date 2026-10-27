import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { addNoteFromSelection, readPageSelection } from './selectionNote';
import { useNotesStore } from './notesStore';
import './notes.css';

const OFFSET = 8;
const EDGE = 8;

interface SelectionAnchor {
  /** Horizontal centre of the selection end, in viewport px. */
  x: number;
  top: number;
  bottom: number;
  /** Multi-line selections put the popover below the last line so it never covers selected text. */
  preferBelow: boolean;
}

/** Floating "Add margin note" button shown while text on a page is selected. */
export function SelectionNotePopover() {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  const editing = useNotesStore((s) => s.editingId !== null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let pointerDown = false;
    let frame = 0;

    const evaluate = () => {
      const selection = useNotesStore.getState().editingId === null ? readPageSelection() : null;
      setAnchor(
        selection
          ? {
              x: selection.endRect.right,
              top: selection.endRect.top,
              bottom: selection.endRect.bottom,
              preferBelow: selection.multiline,
            }
          : null,
      );
    };
    // Wait for a drag to finish, and coalesce bursts of selectionchange.
    const schedule = () => {
      if (pointerDown) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(evaluate);
    };
    const hide = () => setAnchor(null);

    const onPointerDown = (e: PointerEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      pointerDown = true;
      hide();
    };
    const onPointerUp = () => {
      pointerDown = false;
      schedule();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    document.addEventListener('selectionchange', schedule);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', schedule);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);

  const visible = anchor !== null && !editing;

  // Sit 8px above the selection end, or below it when there is no room (or the
  // selection runs over several lines), and keep the popover on screen.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover || !anchor) return;
    const { offsetWidth: width, offsetHeight: height } = popover;
    const bounds = document.querySelector('.reader__viewport')?.getBoundingClientRect();
    const minTop = Math.max(bounds?.top ?? 0, 0) + EDGE;
    const maxTop = window.innerHeight - height - EDGE;
    const above = anchor.top - OFFSET - height;
    const below = anchor.bottom + OFFSET;
    const fitsAbove = above >= minTop;
    const fitsBelow = below <= maxTop;
    const top = (anchor.preferBelow && fitsBelow) || !fitsAbove ? below : above;
    popover.style.top = `${Math.round(Math.min(top, maxTop))}px`;
    popover.style.left = `${Math.round(Math.max(EDGE, Math.min(anchor.x - width / 2, window.innerWidth - width - EDGE)))}px`;
  }, [anchor, visible]);

  if (!visible) return null;

  return (
    <div ref={popoverRef} className="selection-popover" role="toolbar" aria-label="Selection actions">
      <button
        type="button"
        className="selection-popover__action"
        // Pressing the button must not clear the text selection it is about to quote.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          addNoteFromSelection();
          setAnchor(null);
        }}
      >
        <MessageSquarePlus aria-hidden="true" />
        Add margin note
        <kbd className="kbd">N</kbd>
      </button>
    </div>
  );
}
