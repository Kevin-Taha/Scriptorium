import { Focus } from 'lucide-react';
import { toggleFocusMode, useFocusMode } from './focusStore';

/** Toolbar toggle for focus mode. */
export function FocusModeButton() {
  const active = useFocusMode();
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon focus-button tooltip tooltip--below"
      data-tooltip="Focus mode (F)"
      aria-label="Focus mode"
      aria-keyshortcuts="F"
      aria-pressed={active}
      onClick={toggleFocusMode}
    >
      <Focus />
    </button>
  );
}
