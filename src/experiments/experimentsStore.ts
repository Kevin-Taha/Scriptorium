import { create } from 'zustand';
import { EXPERIMENT_IDS, type ExperimentId } from './registry';

const STORAGE_KEY = 'scriptorium.experiments';

type Flags = Record<ExperimentId, boolean>;

interface ExperimentsState {
  enabled: Flags;
  labOpen: boolean;
  setEnabled(id: ExperimentId, on: boolean): void;
  toggle(id: ExperimentId): void;
  setAll(on: boolean): void;
  openLab(): void;
  closeLab(): void;
}

function allFlags(on: boolean): Flags {
  return Object.fromEntries(EXPERIMENT_IDS.map((id) => [id, on])) as Flags;
}

function readStored(): Partial<Flags> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Flags>) : {};
  } catch {
    return {};
  }
}

/**
 * `?exp=minimap,focus-mode` (or `?exp=all` / `?exp=none`) in the URL switches
 * experiments on at launch, so a link can open the app with a demo set up.
 */
function readQuery(): Partial<Flags> {
  if (typeof window === 'undefined') return {};
  const value = new URLSearchParams(window.location.search).get('exp');
  if (value === null) return {};
  if (value === 'all') return allFlags(true);
  if (value === 'none') return allFlags(false);
  const ids = value.split(',').map((s) => s.trim());
  return Object.fromEntries(
    ids
      .filter((id): id is ExperimentId => (EXPERIMENT_IDS as readonly string[]).includes(id))
      .map((id) => [id, true]),
  );
}

function initialFlags(): Flags {
  const flags = { ...allFlags(false), ...readStored(), ...readQuery() };
  for (const key of Object.keys(flags)) {
    if (!(EXPERIMENT_IDS as readonly string[]).includes(key)) delete flags[key as ExperimentId];
  }
  return flags;
}

function persist(flags: Flags): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // Private mode: flags still apply for this session.
  }
}

export const useExperimentsStore = create<ExperimentsState>()((set, get) => ({
  enabled: initialFlags(),
  labOpen: false,
  setEnabled(id, on) {
    const enabled = { ...get().enabled, [id]: on };
    set({ enabled });
    persist(enabled);
  },
  toggle(id) {
    get().setEnabled(id, !get().enabled[id]);
  },
  setAll(on) {
    const enabled = allFlags(on);
    set({ enabled });
    persist(enabled);
  },
  openLab: () => set({ labOpen: true }),
  closeLab: () => set({ labOpen: false }),
}));

persist(useExperimentsStore.getState().enabled);

/** Whether an experiment is switched on; re-renders when it changes. */
export function useExperiment(id: ExperimentId): boolean {
  return useExperimentsStore((s) => s.enabled[id]);
}

/** Non-hook check for event handlers and stores. */
export function isExperimentOn(id: ExperimentId): boolean {
  return useExperimentsStore.getState().enabled[id];
}

export function openExperimentsLab(): void {
  useExperimentsStore.getState().openLab();
}
