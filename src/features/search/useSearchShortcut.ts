import { useEffect } from 'react';
import { isEditableTarget } from '@/lib/util';
import { type KeyEvent, matches } from '../commands/keys';
import { useReaderStore } from '../reader/readerStore';
import { focusSearchInput, SEARCH_INPUT_ID } from './searchDom';
import { useSearchStore } from './searchStore';

type SearchShortcut = 'open' | 'next' | 'prev';

/** Maps a key press to a search action, or null. `typing` is true while focus is in a text field. */
export function resolveSearchShortcut(
  event: KeyEvent,
  context: { typing: boolean; inSearchField: boolean; hasQuery: boolean },
): SearchShortcut | null {
  // Ctrl/⌘+F works from any field; `/` would type itself there.
  if (matches(event, 'search') && (!context.typing || event.ctrlKey || event.metaKey)) return 'open';
  if (context.typing && !context.inSearchField) return null;
  if (!context.hasQuery) return null;
  if (matches(event, 'next-result')) return 'next';
  if (matches(event, 'previous-result')) return 'prev';
  return null;
}

/** Ctrl/Cmd+F (or /) opens the search tab and focuses its field; F3 / Ctrl+G step through matches. */
export function useSearchShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog:modal')) return;
      const target = event.target;
      const action = resolveSearchShortcut(event, {
        typing: isEditableTarget(target),
        inSearchField: target instanceof HTMLElement && target.id === SEARCH_INPUT_ID,
        hasQuery: useSearchStore.getState().query.trim() !== '',
      });
      if (!action) return;
      event.preventDefault();
      if (action === 'open') {
        useReaderStore.getState().setSidebarTab('search');
        focusSearchInput();
      } else if (action === 'next') {
        useSearchStore.getState().next();
      } else {
        useSearchStore.getState().prev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
