import { useEffect, useState } from 'react';
import { Focus } from 'lucide-react';
import { keyLabel } from '../commands/keys';

const HINT_MS = 5000;
/** Outlasts the fade-out transition in focus.css. */
const FADE_MS = 400;

/** A brief pill saying how to get the controls back and how to leave. */
export function FocusHint() {
  const [phase, setPhase] = useState<'shown' | 'fading' | 'gone'>('shown');

  useEffect(() => {
    const fade = window.setTimeout(() => setPhase('fading'), HINT_MS);
    const remove = window.setTimeout(() => setPhase('gone'), HINT_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div className="focus-hint" data-fading={phase === 'fading' || undefined}>
      <Focus aria-hidden="true" />
      <strong>Focus mode</strong>
      <span className="focus-hint__sep" aria-hidden="true">
        ·
      </span>
      <span>Move to the top edge for controls</span>
      <span className="focus-hint__sep" aria-hidden="true">
        ·
      </span>
      <span>
        <kbd className="kbd">{keyLabel('focus')}</kbd> or <kbd className="kbd">{keyLabel('dismiss')}</kbd> to
        leave
      </span>
    </div>
  );
}
