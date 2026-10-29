import { create } from 'zustand';

export const useGoToStore = create<{ open: boolean }>()(() => ({ open: false }));

/** Opens the Go to palette (G). */
export function openGoTo(): void {
  useGoToStore.setState({ open: true });
}

export function closeGoTo(): void {
  useGoToStore.setState({ open: false });
}
