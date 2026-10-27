import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useReaderStore } from '../reader/readerStore';
import { useHistoryStore } from './historyStore';
import { formatPageRef, pageLabelFor } from './pageLabels';

export function HistoryButtons() {
  const back = useHistoryStore((s) => s.back.at(-1));
  const forward = useHistoryStore((s) => s.forward.at(-1));
  const labels = useReaderStore((s) => s.pageLabels);
  const goBack = useHistoryStore((s) => s.goBack);
  const goForward = useHistoryStore((s) => s.goForward);

  return (
    <>
      <button
        className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
        aria-label={back ? `Back to page ${pageLabelFor(labels, back.page)} (Alt+Left)` : 'Back (Alt+Left)'}
        data-tooltip={back ? `Back to ${formatPageRef(labels, back.page)} (Alt+←)` : 'Back (Alt+←)'}
        disabled={!back}
        onClick={goBack}
      >
        <ArrowLeft />
      </button>
      <button
        className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
        aria-label={
          forward
            ? `Forward to page ${pageLabelFor(labels, forward.page)} (Alt+Right)`
            : 'Forward (Alt+Right)'
        }
        data-tooltip={
          forward ? `Forward to ${formatPageRef(labels, forward.page)} (Alt+→)` : 'Forward (Alt+→)'
        }
        disabled={!forward}
        onClick={goForward}
      >
        <ArrowRight />
      </button>
    </>
  );
}
