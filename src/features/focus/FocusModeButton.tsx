import { Focus } from 'lucide-react';
import { ariaKeyShortcuts, withShortcut } from '../commands/keys';
import { toggleFocusMode, useFocusStore } from './focusStore';

/** Toolbar toggle for focus mode. */
export function FocusModeButton() {
  const active = useFocusStore((s) => s.active);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon focus-button tooltip tooltip--below"
      data-tooltip={withShortcut('Focus mode', 'focus')}
      aria-label="Focus mode"
      aria-keyshortcuts={ariaKeyShortcuts('focus')}
      aria-pressed={active}
      onClick={toggleFocusMode}
    >
      <Focus />
    </button>
  );
}
