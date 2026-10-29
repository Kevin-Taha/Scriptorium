import { create } from 'zustand';
import { getSettings, putSettings } from '@/lib/storage/repository';
import { DEFAULT_SETTINGS, type AppSettings, type Theme } from '@/lib/types';

const THEME_CACHE_KEY = 'scriptorium.theme';

/** The settings that are plain on/off switches. */
export type SettingSwitch = {
  [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never;
}[keyof AppSettings];

interface SettingsState extends AppSettings {
  loaded: boolean;
  load(): Promise<void>;
  setTheme(theme: Theme): void;
  setInvertPagesInDark(invert: boolean): void;
  toggle(key: SettingSwitch): void;
}

function apply({ theme }: AppSettings): void {
  document.documentElement.dataset.theme = theme;
  // Cached synchronously so the next launch paints with the right theme before IndexedDB loads.
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the theme still applies for this session.
  }
}

function snapshot(s: SettingsState): AppSettings {
  const { theme, invertPagesInDark, readingRuler, bookMap, chapterProgress } = s;
  return { theme, invertPagesInDark, readingRuler, bookMap, chapterProgress };
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    const settings = await getSettings();
    set({ ...settings, loaded: true });
    apply(settings);
  },

  setTheme(theme) {
    set({ theme });
    apply(snapshot(get()));
    void putSettings(snapshot(get()));
  },

  setInvertPagesInDark(invertPagesInDark) {
    set({ invertPagesInDark });
    void putSettings(snapshot(get()));
  },

  toggle(key) {
    set({ [key]: !get()[key] });
    void putSettings(snapshot(get()));
  },
}));

/** True when page canvases should be colour-inverted (dark theme + preference). */
export function usePagesInverted(): boolean {
  return useSettingsStore((s) => s.theme === 'dark' && s.invertPagesInDark);
}

export { THEME_CACHE_KEY };
