import { useEffect, useRef, useState } from 'react';
import { BookA, Highlighter, MessageSquarePlus } from 'lucide-react';
import { NOTE_COLORS } from '@/lib/types';
import { ariaKeyShortcuts, keyLabel, withShortcut } from '../commands/keys';
import { termFromSelection } from '../define/dictionary';
import { lookUpSelection, useDefineStore } from '../define/defineStore';
import { useFloatingPosition, type FloatingAnchor } from './floatingPosition';
import { highlightSelection } from './highlightActions';
import { HighlightPopover } from './HighlightPopover';
import { useHighlightsStore } from './highlightsStore';
import { NOTE_COLOR_LABELS } from './noteColors';
import { useNotesStore } from './notesStore';
import { addNoteFromSelection, readPageSelection } from './selectionNote';
import { useHighlightShortcut } from './useHighlightShortcut';
import './highlights.css';
import './notes.css';

/**
 * Everything that appears over the page for annotating: the toolbar for a text
 * selection (highlight in a colour, add a margin note, or look a word up), the popover for an
 * existing highlight, and the `H` shortcut. Mount once in the reader.
 */
export function SelectionNotePopover() {
  useHighlightShortcut();
  return (
    <>
      <SelectionToolbar />
      <HighlightPopover />
    </>
  );
}

/** Floating toolbar shown while text on a page is selected. */
function SelectionToolbar() {
  const [anchor, setAnchor] = useState<FloatingAnchor | null>(null);
  const [isTerm, setIsTerm] = useState(false);
  const editing = useNotesStore((s) => s.editingId !== null);
  const defining = useDefineStore((s) => s.term !== null);
  const lastColor = useHighlightsStore((s) => s.lastColor);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let pointerDown = false;
    let frame = 0;

    const evaluate = () => {
      const selection = useNotesStore.getState().editingId === null ? readPageSelection() : null;
      setIsTerm(!!selection && termFromSelection(selection.text) !== null);
      setAnchor(
        selection
          ? {
              x: selection.endRect.right,
              top: selection.endRect.top,
              bottom: selection.endRect.bottom,
              // Multi-line selections put the toolbar below the last line so it never covers selected text.
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
      if (e.key !== 'Escape') return;
      // Esc closes only the toolbar when it is showing, not focus mode or the Return pill too.
      if (popoverRef.current) e.preventDefault();
      hide();
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

  const visible = anchor !== null && !editing && !defining;
  // A lookup takes the toolbar's place; closing the card leaves the page clear.
  useEffect(() => {
    if (defining) setAnchor(null);
  }, [defining]);
  useFloatingPosition(popoverRef, anchor, visible);

  if (!visible) return null;

  return (
    <div ref={popoverRef} className="selection-popover" role="toolbar" aria-label="Selection actions">
      <div className="selection-popover__highlight" role="group" aria-label="Highlight selection">
        <Highlighter className="selection-popover__icon" aria-hidden="true" />
        {NOTE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`selection-popover__swatch tooltip${color === lastColor ? ' is-last' : ''}`}
            data-note-color={color}
            data-tooltip={
              color === lastColor
                ? withShortcut(`Highlight ${NOTE_COLOR_LABELS[color].toLowerCase()}`, 'highlight')
                : `Highlight ${NOTE_COLOR_LABELS[color].toLowerCase()}`
            }
            aria-label={`Highlight ${NOTE_COLOR_LABELS[color]}`}
            aria-keyshortcuts={color === lastColor ? ariaKeyShortcuts('highlight') : undefined}
            // Pressing a button must not clear the text selection it is about to use.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              highlightSelection(color);
              setAnchor(null);
            }}
          />
        ))}
        {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: <kbd> is not focusable; the hint is redundant for screen readers */}
        <kbd className="kbd" aria-hidden="true">
          {keyLabel('highlight')}
        </kbd>
      </div>
      <span className="selection-popover__divider" aria-hidden="true" />
      <button
        type="button"
        className="selection-popover__action selection-popover__action--icon tooltip"
        data-tooltip={withShortcut('Add margin note', 'note')}
        aria-label="Add margin note"
        aria-keyshortcuts={ariaKeyShortcuts('note')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          addNoteFromSelection();
          setAnchor(null);
        }}
      >
        <MessageSquarePlus aria-hidden="true" />
      </button>
      {isTerm && (
        <button
          type="button"
          className="selection-popover__action selection-popover__action--icon tooltip"
          data-tooltip={withShortcut('Define', 'define')}
          aria-label="Define"
          aria-keyshortcuts={ariaKeyShortcuts('define')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => lookUpSelection()}
        >
          <BookA aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
