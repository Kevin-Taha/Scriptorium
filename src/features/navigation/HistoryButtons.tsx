import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useHistoryStore } from './historyStore';

export function HistoryButtons() {
  const back = useHistoryStore((s) => s.back.at(-1));
  const forward = useHistoryStore((s) => s.forward.at(-1));
  const goBack = useHistoryStore((s) => s.goBack);
  const goForward = useHistoryStore((s) => s.goForward);

  return (
    <>
      <button
        className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
        aria-label={back ? `Back to page ${back.page} (Alt+Left)` : 'Back (Alt+Left)'}
        data-tooltip={back ? `Back to p. ${back.page} (Alt+←)` : 'Back (Alt+←)'}
        disabled={!back}
        onClick={goBack}
      >
        <ArrowLeft />
      </button>
      <button
        className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
        aria-label={forward ? `Forward to page ${forward.page} (Alt+Right)` : 'Forward (Alt+Right)'}
        data-tooltip={forward ? `Forward to p. ${forward.page} (Alt+→)` : 'Forward (Alt+→)'}
        disabled={!forward}
        onClick={goForward}
      >
        <ArrowRight />
      </button>
    </>
  );
}
