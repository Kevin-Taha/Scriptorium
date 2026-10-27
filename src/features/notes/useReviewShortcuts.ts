import { useEffect } from 'react';
import { isEditableTarget } from '@/lib/util';
import { focusAdjacentNote } from './reviewFocus';

interface ReviewShortcuts {
  onExit(): void;
  onFocusSearch(): void;
}

/** Keyboard shortcuts for the review (the reader's own shortcuts are not mounted here). */
export function useReviewShortcuts({ onExit, onFocusSearch }: ReviewShortcuts): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (isEditableTarget(event.target)) return;

      if (event.key === 'Escape' || (event.shiftKey && event.key.toLowerCase() === 'r')) {
        event.preventDefault();
        onExit();
      } else if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        focusAdjacentNote(event.key === 'j' ? 1 : -1);
      } else if (event.key === '/') {
        event.preventDefault();
        onFocusSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExit, onFocusSearch]);
}
