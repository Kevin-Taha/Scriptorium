import { useEffect } from 'react';
import { isEditableTarget } from '@/lib/util';
import { matches } from '../commands/keys';
import { openShortcutsDialog } from '../navigation/ShortcutsDialog';
import { focusAdjacentNote } from './reviewFocus';

interface ReviewShortcuts {
  onExit(): void;
  onFocusSearch(): void;
}

/** In order of precedence: `/` is the filter here even on layouts that type it with Shift. */
const REVIEW_SHORTCUTS = ['close-review', 'next-note', 'previous-note', 'filter-notes', 'help'] as const;

/** Keyboard shortcuts for the review (the reader's own shortcuts are not mounted here). */
export function useReviewShortcuts({ onExit, onFocusSearch }: ReviewShortcuts): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditableTarget(event.target)) return;
      if (document.querySelector('dialog:modal')) return;
      const action = REVIEW_SHORTCUTS.find((id) => matches(event, id));
      if (!action) return;
      event.preventDefault();
      switch (action) {
        case 'close-review':
          onExit();
          break;
        case 'next-note':
          focusAdjacentNote(1);
          break;
        case 'previous-note':
          focusAdjacentNote(-1);
          break;
        case 'filter-notes':
          onFocusSearch();
          break;
        case 'help':
          openShortcutsDialog();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExit, onFocusSearch]);
}
