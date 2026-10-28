import { create } from 'zustand';

export const useStorageDialogStore = create<{ open: boolean }>()(() => ({ open: false }));

let opener: HTMLElement | null = null;

/** Opens "Library & storage". Pass the control that should regain focus when it closes, if it won't survive. */
export function openLibraryStorageDialog(from?: HTMLElement | null): void {
  if (useStorageDialogStore.getState().open) return;
  const active = document.activeElement;
  opener = from ?? (active instanceof HTMLElement ? active : null);
  useStorageDialogStore.setState({ open: true });
}

export function closeLibraryStorageDialog(): void {
  useStorageDialogStore.setState({ open: false });
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
}
