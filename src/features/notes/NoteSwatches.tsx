import { Check } from 'lucide-react';
import { NOTE_COLORS, type NoteColor } from '@/lib/types';
import { NOTE_COLOR_LABELS } from './noteColors';
import './notes.css';

interface NoteSwatchesProps {
  value: NoteColor;
  onChange(color: NoteColor): void;
  className?: string;
}

/** Row of colour choices; the selected one carries a check so colour is never the only signal. */
export function NoteSwatches({ value, onChange, className }: NoteSwatchesProps) {
  return (
    <div className={className ? `swatches ${className}` : 'swatches'} role="group" aria-label="Note colour">
      {NOTE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className="swatch"
          data-note-color={color}
          aria-label={NOTE_COLOR_LABELS[color]}
          aria-pressed={value === color}
          // Keep focus where it is so choosing a colour never ends editing.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(color)}
        >
          {value === color && <Check aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
