import { create } from 'zustand';
import type { FloatingAnchor } from './floatingPosition';

const PULSE_MS = 1200;
let pulseTimer: ReturnType<typeof setTimeout> | null = null;

interface HighlightUiState {
  /** Highlight under the pointer on the page. */
  hoverId: string | null;
  /** Highlight whose linked note is under the pointer in the margin. */
  linkedHoverId: string | null;
  /** Highlight whose editing popover is open, and where it attaches. */
  activeId: string | null;
  anchor: FloatingAnchor | null;
  /** Highlight to flash briefly after jumping to it. */
  pulsingId: string | null;

  setHover(id: string | null): void;
  setLinkedHover(id: string | null): void;
  openPopover(id: string, anchor: FloatingAnchor): void;
  closePopover(): void;
  pulse(id: string): void;
}

export const useHighlightUiStore = create<HighlightUiState>()((set) => ({
  hoverId: null,
  linkedHoverId: null,
  activeId: null,
  anchor: null,
  pulsingId: null,

  setHover: (hoverId) => set((s) => (s.hoverId === hoverId ? s : { hoverId })),
  setLinkedHover: (linkedHoverId) => set((s) => (s.linkedHoverId === linkedHoverId ? s : { linkedHoverId })),
  openPopover: (activeId, anchor) => set({ activeId, anchor }),
  closePopover: () => set((s) => (s.activeId === null ? s : { activeId: null, anchor: null })),
  pulse(id) {
    if (pulseTimer) clearTimeout(pulseTimer);
    set({ pulsingId: id });
    pulseTimer = setTimeout(() => set({ pulsingId: null }), PULSE_MS);
  },
}));

/** Whether a highlight should look emphasised: hovered, its note hovered, or its popover open. */
export function useIsHighlightEmphasised(id: string): boolean {
  return useHighlightUiStore((s) => s.hoverId === id || s.linkedHoverId === id || s.activeId === id);
}

export function useIsHighlightPulsing(id: string): boolean {
  return useHighlightUiStore((s) => s.pulsingId === id);
}
