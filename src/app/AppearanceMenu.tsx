import { useEffect, useId, useRef, useState } from 'react';
import { ALargeSmall, Coffee, HardDrive, Keyboard, Moon, Sun } from 'lucide-react';
import type { CommandId } from '@/features/commands/commands';
import { ariaKeyShortcuts, keyLabel } from '@/features/commands/keys';
import { toggleFocusMode, useFocusStore } from '@/features/focus/focusStore';
import { openShortcutsDialog } from '@/features/navigation/ShortcutsDialog';
import { ZoomControls } from '@/features/reader/ZoomControls';
import { openLibraryStorageDialog } from '@/features/settings/storageDialogStore';
import type { Theme } from '@/lib/types';
import { type SettingSwitch, useSettingsStore } from './settingsStore';

const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'sepia', label: 'Sepia', Icon: Coffee },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

const READING_SWITCHES: { key: SettingSwitch; label: string; command?: CommandId }[] = [
  { key: 'readingRuler', label: 'Reading ruler', command: 'ruler' },
  { key: 'bookMap', label: 'Book map' },
  { key: 'chapterProgress', label: 'Chapter progress' },
];

/** A keycap beside a menu row; the control itself carries `aria-keyshortcuts`. */
function KeyHint({ command }: { command: CommandId }) {
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: <kbd> is not focusable; the control carries aria-keyshortcuts
    <kbd className="kbd appearance-menu__key" aria-hidden="true">
      {keyLabel(command)}
    </kbd>
  );
}

/** The reader's view menu: theme, zoom, focus mode and reading aids, plus shortcuts and storage. */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const settings = useSettingsStore();
  const focusActive = useFocusStore((s) => s.active);
  const { theme } = settings;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // The zoom menu inside closes itself first.
      if (e.key !== 'Escape' || (e.target as Element | null)?.closest?.('[role="menu"]')) return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  /** Closes the menu, handing focus back to its button so a dialog opened next can return it there. */
  const closeThen = (action: () => void) => {
    setOpen(false);
    buttonRef.current?.focus();
    action();
  };

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
        <ALargeSmall />
      </button>
      {open && (
        <div className="popover appearance-menu__panel" id={panelId} role="dialog" aria-label="Appearance">
          <div className="appearance-menu__group">
            <div className="segmented segmented--full" role="radiogroup" aria-label="Theme">
              {THEMES.map(({ id, label, Icon }) => (
                <button
                  type="button"
                  key={id}
                  role="radio"
                  className="segmented__item"
                  aria-checked={theme === id}
                  onClick={() => settings.setTheme(id)}
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
                checked={settings.invertPagesInDark}
                disabled={theme !== 'dark'}
                onChange={(e) => settings.setInvertPagesInDark(e.target.checked)}
              />
            </label>
          </div>

          <div className="appearance-menu__group">
            <div className="appearance-menu__row">
              <span>Zoom</span>
              <ZoomControls />
            </div>
            <label className="appearance-menu__switch">
              <span>Focus mode</span>
              <KeyHint command="focus" />
              <input
                type="checkbox"
                // biome-ignore lint/a11y/useAriaPropsForRole: the native checkbox already exposes its checked state
                role="switch"
                checked={focusActive}
                aria-keyshortcuts={ariaKeyShortcuts('focus')}
                onChange={() => closeThen(toggleFocusMode)}
              />
            </label>
            {READING_SWITCHES.map(({ key, label, command }) => (
              <label className="appearance-menu__switch" key={key}>
                <span>{label}</span>
                {command && <KeyHint command={command} />}
                <input
                  type="checkbox"
                  // biome-ignore lint/a11y/useAriaPropsForRole: the native checkbox already exposes its checked state
                  role="switch"
                  checked={settings[key]}
                  aria-keyshortcuts={command && ariaKeyShortcuts(command)}
                  onChange={() => settings.toggle(key)}
                />
              </label>
            ))}
          </div>

          <div className="appearance-menu__group appearance-menu__group--links">
            <button
              type="button"
              className="appearance-menu__link"
              aria-keyshortcuts={ariaKeyShortcuts('help')}
              onClick={() => closeThen(openShortcutsDialog)}
            >
              <Keyboard aria-hidden="true" />
              Keyboard shortcuts
              <KeyHint command="help" />
            </button>
            <button
              type="button"
              className="appearance-menu__link"
              onClick={() => closeThen(() => openLibraryStorageDialog(buttonRef.current))}
            >
              <HardDrive aria-hidden="true" />
              Library & storage…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
