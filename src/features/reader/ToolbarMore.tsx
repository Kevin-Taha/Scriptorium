import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MoreHorizontal, NotebookText } from 'lucide-react';
import { ariaKeyShortcuts } from '../commands/keys';
import { useHistoryStore } from '../navigation/historyStore';
import { formatPageRef } from '../navigation/pageLabels';
import { useReaderStore } from './readerStore';

const PHONE_QUERY = '(max-width: 600px)';

/**
 * The toolbar's overflow on phones, where Back, Forward and Review notes have no room beside
 * Go to, the page field and Appearance. reader.css shows it only there.
 */
export function ToolbarMore({ noteCount, onReview }: { noteCount: number; onReview(): void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const back = useHistoryStore((s) => s.back.at(-1));
  const forward = useHistoryStore((s) => s.forward.at(-1));
  const labels = useReaderStore((s) => s.pageLabels);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Captured on the document: Safari doesn't focus a tapped button, so focus may be anywhere.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    const phone = window.matchMedia?.(PHONE_QUERY);
    const onPhoneChange = (e: MediaQueryListEvent) => {
      if (e.matches) return;
      const hadFocus = rootRef.current?.contains(document.activeElement);
      setOpen(false);
      if (hadFocus) document.querySelector<HTMLElement>('.reader__viewport')?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown, true);
    phone?.addEventListener('change', onPhoneChange);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown, true);
      phone?.removeEventListener('change', onPhoneChange);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    buttonRef.current?.focus();
    action();
  };

  return (
    <div className="reader__more" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="btn btn--ghost btn--icon tooltip tooltip--below"
        data-tooltip="More"
        aria-label="More"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal />
      </button>
      {open && (
        <div className="popover reader__more-panel" id={panelId} role="group" aria-label="More">
          <button
            type="button"
            className="reader__more-item"
            aria-keyshortcuts={ariaKeyShortcuts('back')}
            disabled={!back}
            onClick={() => choose(useHistoryStore.getState().goBack)}
          >
            <ArrowLeft aria-hidden="true" />
            <span className="reader__more-label">
              {back ? `Back to ${formatPageRef(labels, back.page)}` : 'Back'}
            </span>
          </button>
          <button
            type="button"
            className="reader__more-item"
            aria-keyshortcuts={ariaKeyShortcuts('forward')}
            disabled={!forward}
            onClick={() => choose(useHistoryStore.getState().goForward)}
          >
            <ArrowRight aria-hidden="true" />
            <span className="reader__more-label">
              {forward ? `Forward to ${formatPageRef(labels, forward.page)}` : 'Forward'}
            </span>
          </button>
          <button
            type="button"
            className="reader__more-item"
            aria-label={`Review notes (${noteCount})`}
            aria-keyshortcuts={ariaKeyShortcuts('review')}
            onClick={() => choose(onReview)}
          >
            <NotebookText aria-hidden="true" />
            <span className="reader__more-label">Review notes</span>
            {noteCount > 0 && <span className="reader__count">{noteCount}</span>}
          </button>
        </div>
      )}
    </div>
  );
}
