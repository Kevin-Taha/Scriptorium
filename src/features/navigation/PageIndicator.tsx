import { useState } from 'react';
import { useReaderStore } from '../reader/readerStore';
import { useHistoryStore } from './historyStore';
import { pageLabelFor, resolvePageInput } from './pageLabels';
import './navigation.css';

export function PageIndicator() {
  const page = useReaderStore((s) => s.location.page);
  const labels = useReaderStore((s) => s.pageLabels);
  const pageCount = useReaderStore((s) => s.doc?.pageCount ?? s.pdf?.numPages ?? 0);
  const label = pageLabelFor(labels, page);
  const hasDistinctLabel = label !== String(page);
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
        className={`input input--sm page-field__input${labels ? ' page-field__input--labeled' : ''}${invalid ? ' is-invalid' : ''}`}
        aria-label="Page number"
        title={labels ? 'Enter a printed page label or # followed by a PDF page number' : undefined}
        inputMode={labels ? 'text' : 'numeric'}
        value={draft ?? label}
        onFocus={(event) => {
          setDraft(label);
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
            const target = resolvePageInput(labels, draft ?? '', pageCount);
            if (target === null) {
              setDraft(label);
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
      <span className="page-field__total">
        {hasDistinctLabel ? `(${page} of ${pageCount})` : `/ ${pageCount}`}
      </span>
    </div>
  );
}
