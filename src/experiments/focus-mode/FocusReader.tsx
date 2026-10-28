import './focus.css';
import { FocusHint } from './FocusHint';
import {
  useChromeReveal,
  useFocusCleanup,
  useFocusEvent,
  useFocusShortcuts,
  useSpotlight,
} from './focusHooks';
import { useFocusStore } from './focusStore';
import { ReadingRuler } from './ReadingRuler';

/** Mounted inside `.reader__main`: shortcuts, the pointer-driven toolbar, the spotlight, ruler and hint. */
export function FocusReader() {
  const active = useFocusStore((s) => s.active);
  const ruler = useFocusStore((s) => s.ruler);
  useFocusShortcuts();
  useFocusEvent();
  useFocusCleanup();
  useChromeReveal(active);
  useSpotlight(active);

  return (
    <>
      {active && ruler && <ReadingRuler />}
      {active && <FocusHint />}
    </>
  );
}
