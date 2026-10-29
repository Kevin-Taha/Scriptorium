import { useEffect, useRef, useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { ariaKeyShortcuts, keyLabel } from '../commands/keys';
import { useReaderStore } from '../reader/readerStore';
import { useHistoryStore } from './historyStore';
import { usePageLabel } from './pageLabels';

export function ReturnPill() {
  const target = useHistoryStore((s) => s.returnTarget);
  const goBack = useHistoryStore((s) => s.goBack);
  const dismiss = useHistoryStore((s) => s.dismissReturn);
  const page = useReaderStore((s) => s.location.page);
  const targetLabel = usePageLabel(target?.page ?? page);
  const previousPage = useRef(page);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (target && page === target.page && previousPage.current !== page) dismiss();
    previousPage.current = page;
  }, [page, target, dismiss]);

  useEffect(() => {
    if (!target || hovered || focused) return;
    const timer = window.setTimeout(dismiss, 12_000);
    return () => window.clearTimeout(timer);
  }, [target, hovered, focused, dismiss]);

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
            onClick={goBack}
          >
            <Undo2 aria-hidden="true" />
            <span key={target.page} className="return-pill__label">
              Return to p. <strong>{targetLabel}</strong>
            </span>
          </button>
          <button type="button" className="return-pill__close" aria-label="Dismiss" onClick={dismiss}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
