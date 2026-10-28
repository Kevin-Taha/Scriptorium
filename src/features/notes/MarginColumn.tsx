import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { Plus } from 'lucide-react';
import { clamp } from '@/lib/util';
import type { PageSize } from '../reader/Viewer';
import { layoutNotes, NOTE_ATTACH_OFFSET, NOTE_COMPACT_HEIGHT, overlapsPlacement } from './layoutNotes';
import { MarginNoteCard } from './MarginNoteCard';
import { useNotesForPage, useNotesStore } from './notesStore';
import './notes.css';

/** Height assumed for a card until it has been measured (replaced before first paint). */
const ESTIMATED_CARD_HEIGHT = 72;
const GHOST_SNAP = 4;
const GHOST_CLEARANCE = 4;

/** Margin column beside a page: its notes, their anchors, and the "add note" affordance. */
export function MarginColumn({ page, size }: { page: number; size: PageSize }) {
  const notes = useNotesForPage(page);
  const editingId = useNotesStore((s) => s.editingId);
  const columnRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [ghostY, setGhostY] = useState<number | null>(null);

  const onMeasure = useCallback((id: string, height: number) => {
    setHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height }));
  }, []);
  const onExpand = useCallback((id: string) => {
    setExpanded((prev) => new Set(prev).add(id));
  }, []);
  const onCollapse = useCallback((id: string) => {
    setExpanded((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const placements = useMemo(
    () =>
      layoutNotes(
        notes.map((note) => ({
          id: note.id,
          anchor: note.y * size.height,
          height: heights[note.id] ?? ESTIMATED_CARD_HEIGHT,
          pinned: note.id === editingId || expanded.has(note.id),
        })),
        size.height,
      ),
    [notes, heights, expanded, editingId, size.height],
  );
  const notesById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);

  // Cards glide to new positions when neighbours change, but never when the page is resized (zoom).
  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    column.removeAttribute('data-settled');
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => column.setAttribute('data-settled', '')),
    );
    return () => cancelAnimationFrame(frame);
  }, [size.height]);

  /** Snapped, in-page y for the pointer, or null when a card is there (nothing to add). */
  const addableY = (clientY: number): number | null => {
    const rect = columnRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const half = NOTE_COMPACT_HEIGHT / 2;
    const y = clamp(Math.round((clientY - rect.top) / GHOST_SNAP) * GHOST_SNAP, half, size.height - half);
    const top = y - NOTE_ATTACH_OFFSET;
    return overlapsPlacement(placements, top, top + NOTE_COMPACT_HEIGHT, GHOST_CLEARANCE) ? null : y;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    // No ghost for touch, or while dragging (e.g. a text selection running into the margin).
    const idle = e.pointerType !== 'touch' && e.buttons === 0;
    const next = idle && e.target === e.currentTarget ? addableY(e.clientY) : null;
    setGhostY((prev) => (prev === next ? prev : next));
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const y = addableY(e.clientY);
    setGhostY(null);
    if (y !== null) useNotesStore.getState().addNote({ page, y: y / size.height });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only shortcut; keyboard users add notes with N
    // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only shortcut; keyboard users add notes with N
    <div
      ref={columnRef}
      className={`margin-column${ghostY !== null ? ' is-adding' : ''}`}
      data-page={page}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setGhostY(null)}
      onClick={onClick}
    >
      {placements.map((placement) => {
        const note = notesById.get(placement.id);
        return (
          note && (
            <MarginNoteCard
              key={note.id}
              note={note}
              placement={placement}
              onMeasure={onMeasure}
              onExpand={onExpand}
              onCollapse={onCollapse}
            />
          )
        );
      })}

      <div
        className="margin-note-ghost"
        data-visible={ghostY !== null || undefined}
        style={{ top: (ghostY ?? 0) - NOTE_ATTACH_OFFSET }}
        aria-hidden="true"
      >
        <Plus />
        <span>Add note</span>
      </div>
    </div>
  );
}
