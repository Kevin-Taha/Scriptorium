import { create } from 'zustand';

export const useFocusStore = create<{ active: boolean }>()(() => ({ active: false }));

export function toggleFocusMode(): void {
  useFocusStore.setState((s) => ({ active: !s.active }));
}

export function exitFocusMode(): void {
  useFocusStore.setState({ active: false });
}
