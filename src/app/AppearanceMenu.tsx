import { useEffect, useId, useRef, useState } from 'react';
import { Coffee, HardDrive, Moon, Palette, Sun } from 'lucide-react';
import { openLibraryStorageDialog } from '@/features/settings/storageDialogStore';
import type { Theme } from '@/lib/types';
import { type SettingSwitch, useSettingsStore } from './settingsStore';

const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'sepia', label: 'Sepia', Icon: Coffee },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

const READING_SWITCHES: { key: SettingSwitch; label: string; detail: string; shortcut?: string }[] = [
  { key: 'readingRuler', label: 'Reading ruler', detail: 'Keeps your place on the line', shortcut: 'R' },
  { key: 'bookMap', label: 'Book map', detail: 'The whole book along the right edge' },
  {
    key: 'chapterProgress',
    label: 'Chapter progress',
    detail: 'Your place in each chapter, under the toolbar',
  },
];

/** Toolbar popover with the theme, page inversion and reading aids. */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const theme = useSettingsStore((s) => s.theme);
  const invert = useSettingsStore((s) => s.invertPagesInDark);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setInvert = useSettingsStore((s) => s.setInvertPagesInDark);
  const settings = useSettingsStore();

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
          <hr className="divider appearance-menu__divider" />
          <div className="appearance-menu__label">Reading</div>
          {READING_SWITCHES.map(({ key, label, detail, shortcut }) => (
            <label className="appearance-menu__switch" key={key}>
              <span>
                {label}
                {shortcut && (
                  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: <kbd> is not focusable; the shortcut is in the shortcuts dialog
                  <kbd className="kbd appearance-menu__kbd" aria-hidden="true">
                    {shortcut}
                  </kbd>
                )}
                <small>{detail}</small>
              </span>
              <input
                type="checkbox"
                // biome-ignore lint/a11y/useAriaPropsForRole: the native checkbox already exposes its checked state
                role="switch"
                checked={settings[key]}
                onChange={(e) => settings.setSwitch(key, e.target.checked)}
              />
            </label>
          ))}
          <hr className="divider appearance-menu__divider" />
          <button
            type="button"
            className="appearance-menu__link"
            onClick={() => {
              setOpen(false);
              openLibraryStorageDialog(buttonRef.current);
            }}
          >
            <HardDrive aria-hidden="true" />
            Library & storage…
          </button>
        </div>
      )}
    </div>
  );
}
