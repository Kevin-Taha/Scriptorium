import { create } from 'zustand';

interface NoteFocusState {
  /** Note that should briefly pulse (e.g. after jumping to it from the review or sidebar). */
  pulsingId: string | null;
  pulseNote(id: string): void;
  clearPulse(): void;
}

const PULSE_MS = 1200;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useNoteFocusStore = create<NoteFocusState>()((set) => ({
  pulsingId: null,
  pulseNote(id) {
    if (timer) clearTimeout(timer);
    set({ pulsingId: id });
    timer = setTimeout(() => set({ pulsingId: null }), PULSE_MS);
  },
  clearPulse() {
    if (timer) clearTimeout(timer);
    set({ pulsingId: null });
  },
}));

/** Hook: whether `noteId` is currently pulsing. */
export function useIsNotePulsing(noteId: string): boolean {
  return useNoteFocusStore((s) => s.pulsingId === noteId);
}
