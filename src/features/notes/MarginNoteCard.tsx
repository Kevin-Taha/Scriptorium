import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Trash2 } from 'lucide-react';
import type { MarginNote, NoteColor } from '@/lib/types';
import { NOTE_ATTACH_OFFSET, type NotePlacement } from './layoutNotes';
import { NOTE_COLOR_LABELS } from './noteColors';
import { deleteNoteWithUndo, isEmptyNote } from './noteActions';
import { useIsNotePulsing } from './noteFocus';
import { NoteSwatches } from './NoteSwatches';
import { useNotesStore } from './notesStore';

const COLLAPSED_LINES = 6;
const FALLBACK_LINE_HEIGHT = 20.25;

interface MarginNoteCardProps {
  note: MarginNote;
  placement: NotePlacement;
  /** Reports the card's natural (uncompacted) height whenever it changes. */
  onMeasure(id: string, height: number): void;
  /** A compact card was expanded in place; keep it from being compacted again. */
  onExpand(id: string): void;
  onCollapse(id: string): void;
}

interface BodyMetrics {
  natural: number;
  limit: number;
}

/** A margin note: anchor dot on the page edge, leader (and tether), and the card itself. */
export const MarginNoteCard = memo(function MarginNoteCard({
  note,
  placement,
  onMeasure,
  onExpand,
  onCollapse,
}: MarginNoteCardProps) {
  const editing = useNotesStore((s) => s.editingId === note.id);
  const pulsing = useIsNotePulsing(note.id);
  const [startedEditing] = useState(editing);
  const [ready, setReady] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetrics | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);

  const compact = placement.compact && !editing;
  const hasText = note.text.length > 0;

  // Transitions stay off until the card has been painted once in its final place.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Report the natural height, which is unaffected by compacting (the content is only hidden).
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const report = () => onMeasure(note.id, content.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(content);
    return () => observer.disconnect();
  }, [note.id, onMeasure]);

  // Track whether the body exceeds its six-line collapsed height.
  const showsText = hasText && !editing;
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || FALLBACK_LINE_HEIGHT;
      const next = { natural: text.offsetHeight, limit: lineHeight * COLLAPSED_LINES };
      setBodyMetrics((prev) =>
        prev && prev.natural === next.natural && prev.limit === next.limit ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [showsText]);

  // Entering edit mode: focus the editor with the caret at the end and keep the card on screen.
  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (input) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    }
    const frame = requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  // Dismiss the colour menu on an outside press (focus may never have entered the card).
  useEffect(() => {
    if (!paletteOpen) return;
    const dismiss = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) setPaletteOpen(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [paletteOpen]);

  const finishEditing = useCallback(() => {
    const { notes, editingId, setEditing, deleteNote } = useNotesStore.getState();
    const current = notes.find((n) => n.id === note.id);
    if (!current) return;
    if (isEmptyNote(current)) deleteNote(note.id);
    else if (editingId === note.id) setEditing(null);
  }, [note.id]);

  // If the page scrolls out of the viewer's render window mid-edit, commit instead of
  // leaving a stale editor to grab focus and scroll when the page comes back.
  useEffect(() => {
    const card = cardRef.current;
    return () => {
      requestAnimationFrame(() => {
        if (card && !card.isConnected && useNotesStore.getState().editingId === note.id) finishEditing();
      });
    };
  }, [note.id, finishEditing]);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    // Switching windows blurs without leaving the card; the editor is still in use.
    if (!document.hasFocus()) return;
    setBodyExpanded(false);
    setPaletteOpen(false);
    onCollapse(note.id);
    if (editing) finishEditing();
  };

  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && paletteOpen) {
      e.stopPropagation();
      setPaletteOpen(false);
      paletteTriggerRef.current?.focus();
      return;
    }
    if (editing || e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (compact) onExpand(note.id);
      else useNotesStore.getState().setEditing(note.id);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      deleteNoteWithUndo(note);
    }
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const commit = e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey));
    if (!commit) return;
    e.preventDefault();
    e.stopPropagation();
    finishEditing();
    cardRef.current?.focus();
  };

  const onCardClick = (e: MouseEvent<HTMLDivElement>) => {
    if (editing || (e.target as Element).closest('button, textarea')) return;
    if (compact) {
      onExpand(note.id);
      return;
    }
    // A drag-selection inside the card is for copying, not editing.
    if (window.getSelection()?.toString()) return;
    useNotesStore.getState().setEditing(note.id);
  };

  // In edit mode, presses on the card chrome must not steal focus from the editor.
  const onCardMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (editing && !(e.target as Element).closest('textarea, button')) e.preventDefault();
  };

  const setColor = (color: NoteColor) => {
    useNotesStore.getState().updateNote(note.id, { color });
    setPaletteOpen(false);
  };

  const anchor = Math.round(placement.anchor);
  const top = Math.round(placement.top);
  const attach = top + NOTE_ATTACH_OFFSET;
  const clamped = bodyMetrics !== null && bodyMetrics.natural > bodyMetrics.limit + 1;
  const bodyStyle = bodyExpanded && bodyMetrics ? { maxHeight: bodyMetrics.natural } : undefined;
  const colorName = NOTE_COLOR_LABELS[note.color];

  const classes = ['margin-note'];
  if (compact) classes.push('is-compact');
  if (editing) classes.push('is-editing');
  if (pulsing) classes.push('is-pulsing');
  if (startedEditing) classes.push('is-new');
  if (paletteOpen) classes.push('has-palette');

  return (
    <div
      className={`margin-note-slot${placement.displaced ? ' is-displaced' : ''}`}
      data-note-color={note.color}
      data-ready={ready || undefined}
    >
      <span
        className="margin-note__anchor"
        style={{ top: anchor }}
        aria-hidden="true"
        onClick={() => cardRef.current?.focus()}
      />
      <span className="margin-note__leader" style={{ top: attach }} aria-hidden="true" />
      {placement.displaced && (
        <span
          className="margin-note__tether"
          style={{ top: Math.min(anchor, attach), height: Math.abs(attach - anchor) }}
          data-direction={attach > anchor ? 'down' : 'up'}
          aria-hidden="true"
        />
      )}

      <div
        ref={cardRef}
        className={classes.join(' ')}
        data-note-color={note.color}
        data-note-id={note.id}
        role="group"
        tabIndex={0}
        aria-label={`Note on page ${note.page}`}
        style={{ top }}
        onBlur={onBlur}
        onKeyDown={onCardKeyDown}
        onClick={onCardClick}
        onMouseDown={onCardMouseDown}
      >
        {compact && <span className="margin-note__preview">{note.text || note.quote}</span>}

        <div ref={contentRef} className="margin-note__content">
          {!editing && (
            <div className="margin-note__actions">
              <button
                ref={paletteTriggerRef}
                type="button"
                className="margin-note__action margin-note__action--color tooltip"
                data-tooltip="Change colour"
                aria-label={`Change colour (currently ${colorName})`}
                aria-haspopup="true"
                aria-expanded={paletteOpen}
                onClick={() => setPaletteOpen((open) => !open)}
              >
                <span className="margin-note__action-dot" />
              </button>
              <button
                type="button"
                className="margin-note__action tooltip"
                data-tooltip="Delete note"
                aria-label="Delete note"
                onClick={() => deleteNoteWithUndo(note)}
              >
                <Trash2 />
              </button>
              {paletteOpen && (
                <NoteSwatches className="margin-note__palette" value={note.color} onChange={setColor} />
              )}
            </div>
          )}

          {note.quote && <blockquote className="margin-note__quote">{note.quote}</blockquote>}

          {editing ? (
            <>
              <div className="margin-note__editor" data-replicated={`${note.text} `}>
                <textarea
                  ref={inputRef}
                  className="margin-note__input"
                  rows={1}
                  value={note.text}
                  placeholder="Write a note…"
                  aria-label={`Note text, page ${note.page}`}
                  spellCheck
                  onChange={(e) => useNotesStore.getState().updateNote(note.id, { text: e.target.value })}
                  onKeyDown={onInputKeyDown}
                />
              </div>
              <div className="margin-note__footer">
                <NoteSwatches value={note.color} onChange={setColor} />
                <button
                  type="button"
                  className="margin-note__action tooltip"
                  data-tooltip="Delete note"
                  aria-label="Delete note"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => deleteNoteWithUndo(note)}
                >
                  <Trash2 />
                </button>
              </div>
            </>
          ) : (
            hasText && (
              <>
                <div
                  className={`margin-note__body${clamped && !bodyExpanded ? ' is-clamped' : ''}`}
                  style={bodyStyle}
                >
                  <div ref={textRef} className="margin-note__text">
                    {note.text}
                  </div>
                </div>
                {clamped && !bodyExpanded && (
                  <button
                    type="button"
                    className="margin-note__more"
                    onClick={() => {
                      setBodyExpanded(true);
                      cardRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    Show more
                  </button>
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
});
