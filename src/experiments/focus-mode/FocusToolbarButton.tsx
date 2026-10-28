import { Focus } from 'lucide-react';
import { useFocusStore } from './focusStore';

/** Toolbar toggle for focus mode (the toolbar itself recedes while it is on, and returns on hover). */
export function FocusToolbarButton() {
  const active = useFocusStore((s) => s.active);
  const toggle = useFocusStore((s) => s.toggle);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon tooltip tooltip--below"
      data-tooltip="Focus mode (F)"
      aria-label="Focus mode"
      aria-pressed={active}
      onClick={toggle}
    >
      <Focus />
    </button>
  );
}
