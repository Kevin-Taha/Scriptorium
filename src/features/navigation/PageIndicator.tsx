import { useState } from 'react';
import { useReaderStore } from '../reader/readerStore';
import { useHistoryStore } from './historyStore';
import './navigation.css';

export function PageIndicator() {
  const page = useReaderStore((s) => s.location.page);
  const pageCount = useReaderStore((s) => s.doc?.pageCount ?? s.pdf?.numPages ?? 0);
  const jumpTo = useHistoryStore((s) => s.jumpTo);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const focusViewport = () => {
    const viewport = document.querySelector<HTMLElement>('.reader__viewport');
    if (viewport) {
      if (!viewport.hasAttribute('tabindex')) viewport.tabIndex = -1;
      viewport.focus({ preventScroll: true });
    } else {
      document.getElementById('page-field')?.blur();
    }
  };

  return (
    <div className="page-field">
      <input
        id="page-field"
        className={`input input--sm page-field__input${invalid ? ' is-invalid' : ''}`}
        aria-label="Page number"
        inputMode="numeric"
        value={draft ?? String(page)}
        onFocus={(event) => {
          setDraft(String(page));
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setInvalid(false);
        }}
        onBlur={() => {
          setDraft(null);
          setInvalid(false);
        }}
        onAnimationEnd={() => setInvalid(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(null);
            focusViewport();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            const value = draft?.trim() ?? '';
            const target = Number(value);
            if (!/^\d+$/.test(value) || !Number.isSafeInteger(target) || target < 1 || target > pageCount) {
              setDraft(String(page));
              setInvalid(true);
              event.currentTarget.select();
              return;
            }
            jumpTo({ page: target, offset: 0 });
            setDraft(null);
            focusViewport();
          }
        }}
      />
      <span className="page-field__total">/ {pageCount}</span>
    </div>
  );
}
