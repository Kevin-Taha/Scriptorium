import { create } from 'zustand';
import { getSettings, putSettings } from '@/lib/storage/repository';
import { DEFAULT_SETTINGS, type AppSettings, type Theme } from '@/lib/types';

const THEME_CACHE_KEY = 'scriptorium.theme';

/** Settings that are simple on/off switches. */
export type SettingSwitch = 'invertPagesInDark' | 'readingRuler' | 'bookMap' | 'chapterProgress';

interface SettingsState extends AppSettings {
  loaded: boolean;
  load(): Promise<void>;
  setTheme(theme: Theme): void;
  setInvertPagesInDark(invert: boolean): void;
  setSwitch(key: SettingSwitch, on: boolean): void;
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
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    (settings as Record<keyof AppSettings, unknown>)[key] = s[key];
  }
  return settings;
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
    get().setSwitch('invertPagesInDark', invertPagesInDark);
  },

  setSwitch(key, on) {
    set({ [key]: on });
    void putSettings(snapshot(get()));
  },

  toggle(key) {
    get().setSwitch(key, !get()[key]);
  },
}));

/** True when page canvases should be colour-inverted (dark theme + preference). */
export function usePagesInverted(): boolean {
  return useSettingsStore((s) => s.theme === 'dark' && s.invertPagesInDark);
}

export { THEME_CACHE_KEY };
