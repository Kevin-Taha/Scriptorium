import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { ZoomState } from '@/lib/types';
import { useReaderStore } from './readerStore';
import { formatZoom, nextZoomStep, setZoomMode, zoomIn, zoomOut } from './zoom';
import './viewer.css';

interface ZoomOption {
  label: string;
  zoom: ZoomState;
}

const ZOOM_OPTIONS: ZoomOption[][] = [
  [
    { label: 'Fit width', zoom: { mode: 'fit-width', scale: 0 } },
    { label: 'Fit page', zoom: { mode: 'fit-page', scale: 0 } },
  ],
  [0.5, 0.75, 1, 1.25, 1.5, 2].map((scale) => ({
    label: formatZoom(scale),
    zoom: { mode: 'custom', scale },
  })),
];

function isSelected(option: ZoomOption, zoom: ZoomState): boolean {
  if (option.zoom.mode !== zoom.mode) return false;
  return zoom.mode !== 'custom' || Math.abs(option.zoom.scale - zoom.scale) < 0.005;
}

/** Zoom out · zoom level menu · zoom in. */
export function ZoomControls() {
  const zoom = useReaderStore((s) => s.zoom);
  const setZoom = useReaderStore((s) => s.setZoom);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const level = formatZoom(zoom.scale);
  const canZoomOut = nextZoomStep(zoom.scale, -1) < zoom.scale - 0.001;
  const canZoomIn = nextZoomStep(zoom.scale, 1) > zoom.scale + 0.001;

  useEffect(() => {
    if (!open) return;
    const items = menuItems(menuRef.current);
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (option: ZoomOption) => {
    if (option.zoom.mode === 'custom') setZoom(option.zoom);
    else setZoomMode(option.zoom.mode);
    closeMenu();
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const items = menuItems(menuRef.current);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        focusAt(index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(items.length - 1);
        break;
      case 'Escape':
        closeMenu();
        break;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="zoom-controls">
      <button
        className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
        data-tooltip="Zoom out"
        aria-label="Zoom out"
        aria-disabled={!canZoomOut}
        onClick={() => canZoomOut && zoomOut()}
      >
        <Minus />
      </button>

      <div className="zoom-controls__menu" ref={rootRef}>
        <button
          ref={triggerRef}
          className="btn btn--ghost btn--sm zoom-controls__level tooltip tooltip--below"
          data-tooltip="Zoom options"
          aria-label={`Zoom level ${level}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={onTriggerKeyDown}
        >
          {level}
        </button>
        {open && (
          <div
            ref={menuRef}
            id={menuId}
            className="popover zoom-menu"
            role="menu"
            aria-label="Zoom"
            onKeyDown={onMenuKeyDown}
          >
            {ZOOM_OPTIONS.map((group, groupIndex) => (
              <div key={groupIndex} role="group" className="zoom-menu__group">
                {group.map((option) => {
                  const selected = isSelected(option, zoom);
                  return (
                    <button
                      key={option.label}
                      role="menuitemradio"
                      aria-checked={selected}
                      tabIndex={-1}
                      className="zoom-menu__item"
                      onClick={() => choose(option)}
                    >
                      <span>{option.label}</span>
                      {selected && <Check aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
        data-tooltip="Zoom in"
        aria-label="Zoom in"
        aria-disabled={!canZoomIn}
        onClick={() => canZoomIn && zoomIn()}
      >
        <Plus />
      </button>
    </div>
  );
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) : [];
}
