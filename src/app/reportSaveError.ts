import { showToast } from '@/components/Toast';

const REPEAT_INTERVAL_MS = 10_000;
let lastShownAt = -Infinity;

/**
 * Surfaces a failed background save (progress, notes, bookmarks) without
 * flooding the reader with repeated toasts while the problem persists.
 */
export function reportSaveError(error: unknown): void {
  console.error('Scriptorium: failed to save changes', error);
  const now = Date.now();
  if (now - lastShownAt < REPEAT_INTERVAL_MS) return;
  lastShownAt = now;
  showToast('Couldn’t save your latest changes. Check that this browser has storage space available.', {
    tone: 'error',
    durationMs: 8000,
  });
}
