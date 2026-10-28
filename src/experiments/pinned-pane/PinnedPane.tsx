import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  PanelRight,
  Pin as PinIcon,
  PictureInPicture2,
  X,
} from 'lucide-react';
import { showToast } from '@/components/Toast';
import { useHistoryStore } from '@/features/navigation/historyStore';
import { pageLabelFor } from '@/features/navigation/pageLabels';
import { useReaderStore } from '@/features/reader/readerStore';
import { sectionForPage } from '@/lib/pdf/outline';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { createId, isEditableTarget } from '@/lib/util';
import { EXPERIMENT_EVENTS, useExperimentEvent, type PinPageDetail } from '../shared/events';
import {
  clampDockWidth,
  clampLayout,
  movedLayout,
  resizedLayout,
  type Bounds,
  type Corner,
} from './geometry';
import {
  MAX_PINS,
  activate,
  activePin,
  loadState,
  pinHeading,
  pinPage,
  pinParts,
  saveState,
  stepPin,
  unpin,
  type PaneLayout,
  type PaneState,
  type Pin,
} from './model';
import { PinnedPageView } from './PinnedPageView';
import './pinnedPane.css';

/** Height of the pane when it is collapsed to its header (header + borders). */
const BAR_HEIGHT = 38;
const NEAR_TOP = 44;
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

type Update = (update: (state: PaneState) => PaneState) => void;

/**
 * Reader slot: keeps pinned pages in a floating pane beside the reading.
 * Pins persist per book; `P` (or the `pinPage` event) pins the current page.
 */
export function PinnedPane() {
  const docId = useReaderStore((s) => s.docId);
  const pdf = useReaderStore((s) => s.pdf);
  if (!docId || !pdf) return null;
  return <PaneController key={docId} docId={docId} pdf={pdf} />;
}

function PaneController({ docId, pdf }: { docId: string; pdf: PDFDocumentProxy }) {
  const [state, setState] = useState(() => loadState(docId));
  const stateRef = useRef(state);

  const update = useCallback<Update>((change) => {
    const next = change(stateRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    saveState(docId, state);
  }, [docId, state]);

  const pinHere = useCallback(
    (detail?: PinPageDetail) => {
      const reader = useReaderStore.getState();
      const location = detail?.location ?? reader.controller?.getLocation() ?? reader.location;
      const page = Math.round(location.page);
      if (!(page >= 1 && page <= pdf.numPages)) return;
      const input = { page, offset: location.offset, title: detail?.title };
      const result = pinPage(stateRef.current, input, createId());
      if (result.outcome === 'full') {
        showToast(`You can pin up to ${MAX_PINS} pages. Unpin one first.`);
        return;
      }
      update(() => result.state);
    },
    [pdf, update],
  );

  useExperimentEvent<PinPageDetail | undefined>(EXPERIMENT_EVENTS.pinPage, pinHere);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat || event.defaultPrevented || isEditableTarget(event.target)) return;
      if (document.querySelector('dialog:modal')) return;
      event.preventDefault();
      pinHere();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pinHere]);

  if (state.pins.length === 0) return null;
  return <Pane pdf={pdf} state={state} update={update} />;
}

type Gesture =
  | { kind: 'move'; x: number; y: number; layout: PaneLayout }
  | { kind: 'resize'; corner: Corner; x: number; y: number; layout: PaneLayout }
  | { kind: 'dock'; x: number; width: number };

interface PaneProps {
  pdf: PDFDocumentProxy;
  state: PaneState;
  update: Update;
}

function Pane({ pdf, state, update }: PaneProps) {
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [gesturing, setGesturing] = useState(false);
  const base = useId();
  const outline = useReaderStore((s) => s.outline);
  const pageLabels = useReaderStore((s) => s.pageLabels);

  const pin = activePin(state)!;
  const { minimised, docked } = state;
  const collapsed = minimised && !docked;
  const label = pageLabelFor(pageLabels, pin.page);
  const section = useMemo(() => sectionForPage(outline, pin.page), [outline, pin.page]);
  const parts = pinParts(pin, label, section);
  const heading = pinHeading(pin, label, section);
  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;

  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setBounds({ width: parent.clientWidth, height: parent.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const layout = bounds
    ? clampLayout(state.layout, bounds, collapsed ? BAR_HEIGHT : undefined)
    : state.layout;
  const dockWidth = bounds ? clampDockWidth(state.dockWidth, bounds) : state.dockWidth;
  const docking = docked && state.pins.length > 0;

  // Docking narrows the reading area; the viewer re-measures its viewport when it shrinks.
  useEffect(() => {
    if (!docking) return;
    const root = document.documentElement;
    root.classList.add('exp-pinned-docked');
    root.style.setProperty('--pinned-dock-width', `${dockWidth}px`);
    return () => {
      root.classList.remove('exp-pinned-docked');
      root.style.removeProperty('--pinned-dock-width');
    };
  }, [docking, dockWidth]);

  const tip =
    !docked &&
    !!bounds &&
    bounds.height - layout.bottom - (collapsed ? BAR_HEIGHT : layout.height) < NEAR_TOP;

  const setActive = (id: string) => update((s) => activate(s, id));
  const toggleMinimised = () => update((s) => ({ ...s, minimised: !s.minimised }));
  const toggleDock = () => update((s) => ({ ...s, docked: !s.docked, minimised: false }));
  const goTo = () => useHistoryStore.getState().jumpTo({ page: pin.page, offset: pin.offset });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || docked || minimised) return;
    event.preventDefault();
    event.stopPropagation();
    update((s) => ({ ...s, minimised: true }));
    toggleRef.current?.focus();
  };

  const onTabsKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const index = state.pins.findIndex((p) => p.id === pin.id);
    const last = state.pins.length - 1;
    const target = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = state.pins[target];
    setActive(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  // ---- Drag and resize (pointer capture keeps the gesture alive outside the pane)
  const begin = (event: PointerEvent<HTMLElement>, next: Gesture) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = next;
    setGesturing(true);
  };

  const onHeaderPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (docked || (event.target as Element).closest('button')) return;
    begin(event, { kind: 'move', x: event.clientX, y: event.clientY, layout });
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || !bounds) return;
    const dx = event.clientX - active.x;
    if (active.kind === 'dock') {
      update((s) => ({ ...s, dockWidth: clampDockWidth(active.width - dx, bounds) }));
      return;
    }
    const dy = event.clientY - active.y;
    const next =
      active.kind === 'move'
        ? movedLayout(active.layout, dx, dy, bounds, collapsed ? BAR_HEIGHT : undefined)
        : resizedLayout(active.layout, active.corner, dx, dy, bounds);
    update((s) => ({ ...s, layout: next }));
  };

  const endGesture = () => {
    gesture.current = null;
    setGesturing(false);
  };

  const style = docked
    ? { width: dockWidth }
    : {
        right: layout.right,
        bottom: layout.bottom,
        width: layout.width,
        height: collapsed ? undefined : layout.height,
      };
  const className = [
    'pinned-pane',
    docked && 'is-docked',
    collapsed && 'is-collapsed',
    gesturing && 'is-gesturing',
    !bounds && 'is-measuring',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside
      ref={rootRef}
      className={className}
      style={style}
      aria-label="Pinned pages"
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <div className="pinned-pane__header" onPointerDown={onHeaderPointerDown}>
        <PinIcon className="pinned-pane__icon" aria-hidden="true" />
        <p className="pinned-pane__title" title={heading}>
          {parts.name && <span className="pinned-pane__name">{parts.name}</span>}
          <span className="pinned-pane__page">{parts.name ? ` · ${parts.page}` : parts.page}</span>
        </p>
        <HeaderButton
          label="Show previous page"
          below={tip}
          disabled={pin.page <= 1}
          onClick={() => update((s) => stepPin(s, pin.id, -1, pdf.numPages))}
        >
          <ChevronLeft />
        </HeaderButton>
        <HeaderButton
          label="Show next page"
          below={tip}
          disabled={pin.page >= pdf.numPages}
          onClick={() => update((s) => stepPin(s, pin.id, 1, pdf.numPages))}
        >
          <ChevronRight />
        </HeaderButton>
        <HeaderButton label={`Go to page ${label}`} below={tip} onClick={goTo}>
          <ArrowUpRight />
        </HeaderButton>
        <HeaderButton
          label={docked ? 'Float pane' : 'Dock to side'}
          below={tip}
          pressed={docked}
          narrowHidden
          onClick={toggleDock}
        >
          {docked ? <PictureInPicture2 /> : <PanelRight />}
        </HeaderButton>
        {!docked && (
          <HeaderButton
            label={minimised ? 'Expand pane' : 'Collapse pane'}
            below={tip}
            expanded={!minimised}
            buttonRef={toggleRef}
            onClick={toggleMinimised}
          >
            {minimised ? <ChevronUp /> : <ChevronDown />}
          </HeaderButton>
        )}
        <HeaderButton
          label={`Unpin page ${label}`}
          below={tip}
          end
          onClick={() => update((s) => unpin(s, pin.id))}
        >
          <X />
        </HeaderButton>
      </div>

      {!collapsed && state.pins.length > 1 && (
        <div className="pinned-pane__tabs" role="tablist" aria-label="Pinned pages" onKeyDown={onTabsKeyDown}>
          {state.pins.map((p) => (
            <TabButton
              key={p.id}
              pin={p}
              id={tabId(p.id)}
              panelId={panelId}
              selected={p.id === pin.id}
              label={pageLabelFor(pageLabels, p.page)}
              onSelect={() => setActive(p.id)}
            />
          ))}
        </div>
      )}

      {!collapsed && (
        <PinnedPageView
          pdf={pdf}
          page={pin.page}
          offset={pin.offset}
          panelId={panelId}
          tabId={state.pins.length > 1 ? tabId(pin.id) : undefined}
          label={heading}
        />
      )}

      {docked && (
        <div
          className="pinned-pane__edge"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize pane"
          onPointerDown={(event) => begin(event, { kind: 'dock', x: event.clientX, width: dockWidth })}
        />
      )}
      {!docked &&
        !collapsed &&
        CORNERS.map((corner) => (
          <div
            key={corner}
            className={`pinned-pane__corner pinned-pane__corner--${corner}`}
            aria-hidden="true"
            onPointerDown={(event) =>
              begin(event, { kind: 'resize', corner, x: event.clientX, y: event.clientY, layout })
            }
          />
        ))}
    </aside>
  );
}

interface HeaderButtonProps {
  label: string;
  below: boolean;
  onClick(): void;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  end?: boolean;
  narrowHidden?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}

function HeaderButton({
  label,
  below,
  onClick,
  children,
  disabled,
  pressed,
  expanded,
  end,
  narrowHidden,
  buttonRef,
}: HeaderButtonProps) {
  const className = [
    'btn btn--ghost btn--icon btn--sm tooltip',
    below && 'tooltip--below',
    end && 'pinned-pane__end',
    narrowHidden && 'pinned-pane__narrow-hidden',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      data-tooltip={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface TabButtonProps {
  pin: Pin;
  id: string;
  panelId: string;
  selected: boolean;
  label: string;
  onSelect(): void;
}

function TabButton({ pin, id, panelId, selected, label, onSelect }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      className="pinned-pane__tab"
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      title={pin.title ? `${pin.title} · p. ${label}` : undefined}
      onClick={onSelect}
    >
      p. {label}
    </button>
  );
}
