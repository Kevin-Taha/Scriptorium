import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronUp, Undo2, X } from 'lucide-react';
import { ariaKeyShortcuts, keyLabel } from '../commands/keys';
import { useReaderStore } from '../reader/readerStore';
import { useHistoryStore } from './historyStore';
import { currentOutlineEntry, outlineEntries } from './outlineCurrent';
import { formatPageRef, usePageLabel } from './pageLabels';

export function ReturnPill() {
  const target = useHistoryStore((s) => s.returnTarget);
  const depth = useHistoryStore((s) => s.back.length);
  const goBack = useHistoryStore((s) => s.goBack);
  const dismiss = useHistoryStore((s) => s.dismissReturn);
  const page = useReaderStore((s) => s.location.page);
  const targetLabel = usePageLabel(target?.page ?? page);
  const previousPage = useRef(page);
  const previousTarget = useRef(target);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [trailOpen, setTrailOpen] = useState(false);

  useEffect(() => {
    // Scrolling by hand onto the offered page makes the pill moot; a return that lands there doesn't.
    if (target && target === previousTarget.current && page === target.page && previousPage.current !== page)
      dismiss();
    previousPage.current = page;
    previousTarget.current = target;
  }, [page, target, dismiss]);

  useEffect(() => {
    if (!target || hovered || focused) return;
    const timer = window.setTimeout(dismiss, 12_000);
    return () => window.clearTimeout(timer);
  }, [target, hovered, focused, dismiss]);

  useEffect(() => {
    if (!target || depth < 2) setTrailOpen(false);
  }, [target, depth]);

  return (
    <div
      className="return-pill-region"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {target && (
        <div className="return-pill">
          <button
            type="button"
            className="return-pill__action tooltip"
            data-tooltip={keyLabel('back')}
            aria-keyshortcuts={ariaKeyShortcuts('back')}
            onClick={() => goBack()}
          >
            <Undo2 aria-hidden="true" />
            <span key={`${target.page}:${depth}`} className="return-pill__label">
              Return to p. <strong>{targetLabel}</strong>
            </span>
          </button>
          {depth > 1 && <ReturnTrail open={trailOpen} setOpen={setTrailOpen} />}
          <button type="button" className="return-pill__close" aria-label="Dismiss" onClick={dismiss}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

/** The back stack beneath the pill's own target, newest first, so the reader can return several jumps at once. */
function ReturnTrail({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const back = useHistoryStore((s) => s.back);
  const returnTo = useHistoryStore((s) => s.returnTo);
  const labels = useReaderStore((s) => s.pageLabels);
  const outline = useReaderStore((s) => s.outline);
  const entries = useMemo(() => outlineEntries(outline), [outline]);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const earlier = back.length - 1;

  useEffect(() => {
    if (!open) return;
    menuItems(menuRef.current)[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, setOpen]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !open) {
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
    <div className="return-trail" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="return-pill__more tooltip"
        data-tooltip="Earlier places"
        aria-label={`${earlier} earlier ${earlier === 1 ? 'place' : 'places'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="return-pill__depth">{earlier}</span>
        <ChevronUp aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="popover return-trail__menu"
          role="menu"
          aria-label="Return to"
          onKeyDown={onMenuKeyDown}
        >
          {back
            .slice(0, -1)
            .map((location, index) => ({ location, index }))
            .reverse()
            .map(({ location, index }) => {
              const chapter = currentOutlineEntry(entries, location)?.item.title;
              return (
                <button
                  type="button"
                  key={index}
                  role="menuitem"
                  tabIndex={-1}
                  className="return-trail__item"
                  onClick={() => {
                    returnTo(index);
                    setOpen(false);
                  }}
                >
                  <span className="return-trail__page">{formatPageRef(labels, location.page)}</span>
                  {chapter && <span className="return-trail__chapter">{chapter}</span>}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}
