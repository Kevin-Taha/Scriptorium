import { create } from 'zustand';

interface GoToState {
  open: boolean;
  /** Text the palette opens with, e.g. a page number typed elsewhere. */
  initialQuery: string;
}

export const useGoToStore = create<GoToState>()(() => ({ open: false, initialQuery: '' }));

/** Opens the Go to palette (G), optionally pre-filled. */
export function openGoTo(initialQuery = ''): void {
  useGoToStore.setState({ open: true, initialQuery });
}

export function closeGoTo(): void {
  useGoToStore.setState({ open: false, initialQuery: '' });
}
