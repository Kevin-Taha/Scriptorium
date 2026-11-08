import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { AlignLeft, Plus } from 'lucide-react';
import type { MarginNote } from '@/lib/types';
import { clamp } from '@/lib/util';
import type { PageSize } from '../reader/Viewer';
import { NOTE_ATTACH_OFFSET, type NotePlacement } from './layoutNotes';
import { MarginNoteCard } from './MarginNoteCard';
import { NOTE_COLOR_LABELS } from './noteColors';
import { useNoteFocusStore } from './noteFocus';
import { plainNoteText } from './noteFormat';
import { useNotesForPage, useNotesStore } from './notesStore';
import { layoutRailMarkers, RAIL_MARKER_GAP, RAIL_MARKER_SIZE } from './railLayout';

/** Height assumed for an open card until it has been measured (replaced before first paint). */
const ESTIMATED_CARD_HEIGHT = 72;
const GHOST_SNAP = 4;

const noop = () => {};

/**
 * The margin on narrow screens: too slim for cards, so each note is a marker at its anchor.
 * Activating a marker opens that note's card beside it, over the edge of the page; a note
 * being written, or one jumped to from elsewhere, opens by itself. Clicking or tapping empty
 * rail adds a note there, as the full margin does.
 */
export function MarginRail({ page, size }: { page: number; size: PageSize }) {
  const notes = useNotesForPage(page);
  const editingId = useNotesStore((s) => s.editingId);
  const pulsingId = useNoteFocusStore((s) => s.pulsingId);
  const railRef = useRef<HTMLDivElement>(null);
  const focusCardOnOpen = useRef(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cardHeight, setCardHeight] = useState(ESTIMATED_CARD_HEIGHT);
  const [ghostY, setGhostY] = useState<number | null>(null);

  const markers = useMemo(
    () =>
      layoutRailMarkers(
        notes.map((n) => ({ id: n.id, anchor: n.y * size.height })),
        size.height,
      ),
    [notes, size.height],
  );
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const openNote = openId ? notesById.get(openId) : undefined;

  // A note being written on this page, or jumped to from the sidebar, map or review, opens.
  useEffect(() => {
    if (editingId && notesById.has(editingId)) setOpenId(editingId);
  }, [editingId, notesById]);
  useEffect(() => {
    if (pulsingId && notesById.has(pulsingId)) setOpenId(pulsingId);
  }, [pulsingId, notesById]);

  useLayoutEffect(() => {
    if (!openId || !focusCardOnOpen.current) return;
    focusCardOnOpen.current = false;
    railRef.current?.querySelector<HTMLElement>('.margin-note')?.focus({ preventScroll: true });
  }, [openId]);

  // A click or tap anywhere else closes the card (an edit in progress commits as the card
  // unmounts). Not pointerdown: on touch that starts every scroll, which must leave it open.
  useEffect(() => {
    if (!openId) return;
    const dismiss = (e: globalThis.MouseEvent) => {
      if (!railRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener('click', dismiss, true);
    return () => document.removeEventListener('click', dismiss, true);
  }, [openId]);

  const close = (returnFocus: boolean) => {
    const id = openId;
    setOpenId(null);
    if (returnFocus && id) markerFor(railRef.current, id)?.focus({ preventScroll: true });
  };

  const toggle = (id: string) => {
    if (openId === id) {
      close(true);
      return;
    }
    focusCardOnOpen.current = true;
    setOpenId(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // An Esc that cancels an IME composition belongs to the editor.
    if (e.key !== 'Escape' || !openId || e.nativeEvent.isComposing) return;
    e.stopPropagation();
    close(true);
  };

  // Tabbing out of an open card closes it; a click elsewhere is handled by `dismiss`.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (openId && next && !e.currentTarget.contains(next)) setOpenId(null);
  };

  const onMeasure = useCallback((_id: string, height: number) => setCardHeight(height), []);

  /** Snapped, in-page y for the pointer, or null when a marker is there. */
  const addableY = (clientY: number): number | null => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const half = RAIL_MARKER_SIZE / 2;
    const y = clamp(Math.round((clientY - rect.top) / GHOST_SNAP) * GHOST_SNAP, half, size.height - half);
    const taken = markers.some(
      (m) => y - half < m.top + m.height + RAIL_MARKER_GAP && y + half > m.top - RAIL_MARKER_GAP,
    );
    return taken ? null : y;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
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

  const cardPlacement = (note: MarginNote): NotePlacement => {
    const anchor = note.y * size.height;
    const top = clamp(anchor - NOTE_ATTACH_OFFSET, 0, Math.max(0, size.height - cardHeight));
    return {
      id: note.id,
      top,
      height: cardHeight,
      compact: false,
      anchor,
      attach: top + NOTE_ATTACH_OFFSET,
      displaced: false,
    };
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only shortcut; keyboard users add notes with N
    <div
      ref={railRef}
      className={`margin-column margin-rail${ghostY !== null ? ' is-adding' : ''}`}
      data-page={page}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setGhostY(null)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {markers.map((marker) => {
        const note = notesById.get(marker.id);
        if (!note) return null;
        const open = note.id === openNote?.id;
        return (
          <RailMarker
            key={note.id}
            note={note}
            top={marker.top}
            anchor={marker.anchor}
            open={open}
            pulsing={note.id === pulsingId}
            onToggle={toggle}
          >
            {open && (
              <MarginNoteCard
                note={note}
                placement={cardPlacement(note)}
                onMeasure={onMeasure}
                onExpand={noop}
                onCollapse={noop}
              />
            )}
          </RailMarker>
        );
      })}

      <div
        className="margin-note-ghost"
        data-visible={ghostY !== null || undefined}
        style={{ top: (ghostY ?? 0) - RAIL_MARKER_SIZE / 2 }}
        aria-hidden="true"
      >
        <Plus />
      </div>
    </div>
  );
}

interface RailMarkerProps {
  note: MarginNote;
  top: number;
  anchor: number;
  open: boolean;
  pulsing: boolean;
  onToggle(id: string): void;
  /** The open card, kept next to its marker so Tab moves from one to the other. */
  children?: ReactNode;
}

function RailMarker({ note, top, anchor, open, pulsing, onToggle, children }: RailMarkerProps) {
  const excerpt = plainNoteText(note.text).trim() || note.quote || 'Empty note';
  const color = NOTE_COLOR_LABELS[note.color].toLowerCase();
  return (
    <>
      <span
        className="margin-note__anchor"
        data-note-color={note.color}
        style={{ top: Math.round(anchor) }}
        aria-hidden="true"
        onClick={() => onToggle(note.id)}
      />
      <button
        type="button"
        className={`margin-rail__marker${pulsing ? ' is-pulsing' : ''}`}
        data-note-color={note.color}
        data-rail-note={note.id}
        style={{ top: Math.round(top) }}
        aria-label={`Note on page ${note.page}, ${color}: ${excerpt}`}
        aria-expanded={open}
        onClick={() => onToggle(note.id)}
      >
        <AlignLeft aria-hidden="true" />
      </button>
      {children}
    </>
  );
}

function markerFor(rail: HTMLElement | null, id: string): HTMLElement | null {
  return rail?.querySelector<HTMLElement>(`[data-rail-note="${CSS.escape(id)}"]`) ?? null;
}
