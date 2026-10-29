import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ariaKeyShortcuts, withShortcut } from '../commands/keys';
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
        type="button"
        className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
        aria-label={withShortcut(back ? `Back to page ${pageLabelFor(labels, back.page)}` : 'Back', 'back', {
          spoken: true,
        })}
        aria-keyshortcuts={ariaKeyShortcuts('back')}
        data-tooltip={withShortcut(back ? `Back to ${formatPageRef(labels, back.page)}` : 'Back', 'back')}
        disabled={!back}
        onClick={goBack}
      >
        <ArrowLeft />
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
        aria-label={withShortcut(
          forward ? `Forward to page ${pageLabelFor(labels, forward.page)}` : 'Forward',
          'forward',
          { spoken: true },
        )}
        aria-keyshortcuts={ariaKeyShortcuts('forward')}
        data-tooltip={withShortcut(
          forward ? `Forward to ${formatPageRef(labels, forward.page)}` : 'Forward',
          'forward',
        )}
        disabled={!forward}
        onClick={goForward}
      >
        <ArrowRight />
      </button>
    </>
  );
}
