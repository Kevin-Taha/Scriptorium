import { useEffect } from 'react';
import { isEditableTarget } from '@/lib/util';
import { matches } from '../commands/keys';
import { useFocusStore } from '../focus/focusStore';
import { openGoTo } from '../palette/paletteStore';
import { clearSearch, stepMatch, useSearchStore } from './searchStore';

/**
 * Ctrl/⌘+F or / opens Go to, which finds text too. Once a match is chosen, F3 / Shift+F3
 * step through the others and Esc clears their highlights.
 */
export function useSearchShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('dialog:modal')) return;
      const typing = isEditableTarget(event.target);
      // Ctrl/⌘+F works from any field; `/` would type itself there.
      if (matches(event, 'search') && (!typing || event.ctrlKey || event.metaKey)) openGoTo();
      else if (typing || !useSearchStore.getState().active) return;
      else if (matches(event, 'next-result')) stepMatch(1);
      else if (matches(event, 'previous-result')) stepMatch(-1);
      else if (matches(event, 'dismiss') && !useFocusStore.getState().active) clearSearch();
      else return;
      event.preventDefault();
    };
    // On the document: menus and popovers see Esc first, the reader's own Esc (the Return pill) after.
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
