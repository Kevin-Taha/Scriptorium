import { memo, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import type { Highlight } from '@/lib/types';
import { deleteHighlightWithUndo } from './highlightActions';
import { NOTE_COLOR_LABELS } from './noteColors';
import { jumpToHighlightInBook } from './reviewActions';
import { focusNoteById, neighbourNoteId } from './reviewFocus';
import { MarkedText } from './ReviewText';
import './highlights.css';

interface ReviewHighlightProps {
  highlight: Highlight;
  /** Folded search words to mark in the passage. */
  terms: string[];
  onActive(id: string | null): void;
}

/** A highlight that has no note: its passage as a quote, with a bar in the highlight's colour. */
export const ReviewHighlight = memo(function ReviewHighlight({
  highlight,
  terms,
  onActive,
}: ReviewHighlightProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.key !== 'Enter') return;
    event.preventDefault();
    jumpToHighlightInBook(highlight);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onActive(null);
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    // A keyboard-triggered click has no pointer position; keep keyboard users in the list.
    const neighbour = event.detail === 0 ? neighbourNoteId(highlight.id) : undefined;
    deleteHighlightWithUndo(highlight);
    requestAnimationFrame(() => focusNoteById(neighbour));
  };

  return (
    <div
      className="review-note review-highlight"
      data-highlight-id={highlight.id}
      data-note-color={highlight.color}
      role="group"
      aria-label={`${NOTE_COLOR_LABELS[highlight.color]} highlight on page ${highlight.page}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: review highlights are keyboard-focusable so their shortcuts work
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onActive(highlight.id)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(highlight.id)}
      onBlur={handleBlur}
    >
      <span className="review-highlight__bar" aria-hidden="true" />
      <blockquote className="review-highlight__text">
        <MarkedText text={highlight.text} terms={terms} />
      </blockquote>
      <div className="review-highlight__actions">
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
          data-tooltip="Show in book"
          aria-label={`Show highlight on page ${highlight.page} in the book`}
          onClick={() => jumpToHighlightInBook(highlight)}
        >
          <ArrowUpRight />
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm review-tooltip-end tooltip tooltip--below"
          data-tooltip="Delete highlight"
          aria-label="Delete highlight"
          onClick={handleDelete}
        >
          <Trash2 />
        </button>
      </div>
    </div>
  );
});
