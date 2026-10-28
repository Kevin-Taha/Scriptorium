import { Pause, Volume2 } from 'lucide-react';
import { usePlayer } from './player';

/** Toolbar toggle: starts reading from the top of the viewport (or the selection), pauses and resumes. */
export function ReadAloudButton() {
  const playing = usePlayer((s) => s.status === 'playing');
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon tooltip tooltip--below"
      data-tooltip="Read aloud (Shift+A)"
      aria-label="Read aloud"
      aria-pressed={playing}
      onClick={() => usePlayer.getState().toggle()}
    >
      {playing ? <Pause aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </button>
  );
}
