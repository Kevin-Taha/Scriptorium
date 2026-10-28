import { useEffect } from 'react';
import { Focus, Ruler } from 'lucide-react';
import { useFocusStore } from './focusStore';

const NOTICE_MS = 2500;

/** A short float-chrome pill near the top centre: how to get the controls back, and ruler feedback. */
export function FocusHint() {
  const notice = useFocusStore((s) => s.notice);
  const clearNotice = useFocusStore((s) => s.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => clearNotice(notice.id), NOTICE_MS + 100);
    return () => window.clearTimeout(timer);
  }, [notice, clearNotice]);

  return (
    <div className="focus-hint-region" role="status" aria-live="polite">
      {notice && (
        <div className="focus-hint" key={notice.id}>
          {notice.kind === 'enter' ? (
            <>
              <Focus aria-hidden="true" />
              <strong>Focus mode</strong>
              <span className="focus-hint__sep" aria-hidden="true">
                ·
              </span>
              <span>move to the top for controls</span>
              <span className="focus-hint__sep" aria-hidden="true">
                ·
              </span>
              <span>
                <kbd className="kbd">F</kbd> to leave
              </span>
            </>
          ) : (
            <>
              <Ruler aria-hidden="true" />
              <strong>Reading ruler {notice.kind === 'ruler-on' ? 'on' : 'off'}</strong>
              <span className="focus-hint__sep" aria-hidden="true">
                ·
              </span>
              <span>
                <kbd className="kbd">Shift</kbd> <kbd className="kbd">F</kbd> to toggle
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
