import { useEffect, useRef, useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { ariaKeyShortcuts, keyLabel } from '../commands/keys';
import { useReaderStore } from '../reader/readerStore';
import { useHistoryStore } from './historyStore';
import { formatPageRef, usePageLabel } from './pageLabels';

export function ReturnPill() {
  const target = useHistoryStore((s) => s.returnTarget);
  const back = useHistoryStore((s) => s.back);
  const depth = back.length;
  const goBack = useHistoryStore((s) => s.goBack);
  const dismiss = useHistoryStore((s) => s.dismissReturn);
  const page = useReaderStore((s) => s.location.page);
  const targetLabel = usePageLabel(target?.page ?? page);
  const labels = useReaderStore((s) => s.pageLabels);
  const previousPage = useRef(page);
  const previousTarget = useRef(target);
  const actionRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
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
    setTrailOpen(false);
    if (!target) {
      setHovered(false);
      setFocused(false);
    }
  }, [target, depth]);

  useEffect(() => {
    if (!trailOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!regionRef.current?.contains(event.target as Node)) setTrailOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [trailOpen]);

  const returnTo = (index: number) => {
    setTrailOpen(false);
    const nextFocus =
      index > 0 ? actionRef.current : document.querySelector<HTMLElement>('.reader__viewport');
    nextFocus?.focus({ preventScroll: true });
    useHistoryStore.getState().returnTo(index);
  };

  return (
    <div
      className="return-pill-region"
      ref={regionRef}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
          setTrailOpen(false);
        }
      }}
    >
      {target && (
        <div className="return-pill">
          <button
            type="button"
            ref={actionRef}
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
          {depth > 1 && (
            <div className="return-trail">
              <button
                type="button"
                className="return-pill__close tooltip"
                data-tooltip="Earlier places"
                aria-label={`${depth - 1} earlier ${depth === 2 ? 'place' : 'places'}`}
                aria-expanded={trailOpen}
                onClick={() => setTrailOpen(!trailOpen)}
              >
                {depth - 1}
              </button>
              {trailOpen && (
                <div className="popover return-trail__list" role="group" aria-label="Earlier places">
                  {back
                    .slice(0, -1)
                    .map((location, index) => ({ location, index }))
                    .reverse()
                    .map(({ location, index }) => (
                      <button
                        type="button"
                        key={index}
                        className="return-trail__item"
                        onClick={() => returnTo(index)}
                      >
                        {formatPageRef(labels, location.page)}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="return-pill__close" aria-label="Dismiss" onClick={dismiss}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
