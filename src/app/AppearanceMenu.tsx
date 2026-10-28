import { useEffect, useId, useRef, useState } from 'react';
import { Coffee, Moon, Palette, Sun } from 'lucide-react';
import type { Theme } from '@/lib/types';
import { useSettingsStore } from './settingsStore';

const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'sepia', label: 'Sepia', Icon: Coffee },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

/** Toolbar popover with the theme switcher and the dark-mode page inversion toggle. */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const theme = useSettingsStore((s) => s.theme);
  const invert = useSettingsStore((s) => s.invertPagesInDark);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setInvert = useSettingsStore((s) => s.setInvertPagesInDark);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="appearance-menu" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="btn btn--ghost btn--icon tooltip tooltip--below"
        data-tooltip="Appearance"
        aria-label="Appearance"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Palette />
      </button>
      {open && (
        <div className="popover appearance-menu__panel" id={panelId} role="dialog" aria-label="Appearance">
          <div className="appearance-menu__label">Theme</div>
          <div className="segmented segmented--full" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label, Icon }) => (
              <button
                type="button"
                key={id}
                role="radio"
                className="segmented__item"
                aria-checked={theme === id}
                onClick={() => setTheme(id)}
              >
                <Icon /> {label}
              </button>
            ))}
          </div>
          <label className={`appearance-menu__switch${theme === 'dark' ? '' : ' is-disabled'}`}>
            <span>
              Invert page colours
              <small>Night reading, dark theme only</small>
            </span>
            <input
              type="checkbox"
              // biome-ignore lint/a11y/useAriaPropsForRole: the native checkbox already exposes its checked state
              role="switch"
              checked={invert}
              disabled={theme !== 'dark'}
              onChange={(e) => setInvert(e.target.checked)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
