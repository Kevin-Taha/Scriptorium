import { Coffee, Contrast, Moon, Sun } from 'lucide-react';
import type { Theme } from '@/lib/types';
import { useSettingsStore } from './settingsStore';

const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'sepia', label: 'Sepia', Icon: Coffee },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

/** Compact theme switcher, with a page-inversion toggle while dark. */
export function ThemeMenu() {
  const theme = useSettingsStore((s) => s.theme);
  const invert = useSettingsStore((s) => s.invertPagesInDark);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setInvert = useSettingsStore((s) => s.setInvertPagesInDark);

  return (
    <div className="theme-menu">
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {THEMES.map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            role="radio"
            className="segmented__item tooltip tooltip--below"
            data-tooltip={label}
            aria-label={`${label} theme`}
            aria-checked={theme === id}
            onClick={() => setTheme(id)}
          >
            <Icon />
          </button>
        ))}
      </div>
      {theme === 'dark' && (
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm tooltip tooltip--below"
          data-tooltip="Invert page colours"
          aria-label="Invert page colours"
          aria-pressed={invert}
          onClick={() => setInvert(!invert)}
        >
          <Contrast />
        </button>
      )}
    </div>
  );
}
