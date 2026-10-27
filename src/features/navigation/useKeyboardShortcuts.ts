import { useEffect } from 'react';
import { navigate } from '@/app/router';
import { isEditableTarget } from '@/lib/util';
import { useNotesStore } from '../notes/notesStore';
import { addNoteFromSelection } from '../notes/selectionNote';
import { useReaderStore } from '../reader/readerStore';
import { setZoomMode, zoomIn, zoomOut } from '../reader/zoom';
import { useBookmarksStore } from './bookmarksStore';
import { useHistoryStore } from './historyStore';
import { openShortcutsDialog } from './ShortcutsDialog';

export type ShortcutAction =
  | 'bookmark'
  | 'note'
  | 'page'
  | 'sidebar'
  | 'review'
  | 'back'
  | 'forward'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-width'
  | 'dismiss'
  | 'help';

export function resolveShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): ShortcutAction | null {
  const { key, ctrlKey, metaKey, altKey, shiftKey } = event;
  if (ctrlKey || metaKey) return null;
  if (altKey) {
    if (shiftKey) return null;
    if (key === 'ArrowLeft') return 'back';
    if (key === 'ArrowRight') return 'forward';
    return null;
  }
  if (key === 'Escape' && !shiftKey) return 'dismiss';
  if (key === '+' || (key === '=' && !shiftKey)) return 'zoom-in';
  if (key === '?' || (key === '/' && shiftKey)) return 'help';
  if (shiftKey) return key.toLowerCase() === 'r' ? 'review' : null;
  switch (key.toLowerCase()) {
    case 'b':
      return 'bookmark';
    case 'n':
      return 'note';
    case 'g':
      return 'page';
    case '[':
      return 'sidebar';
    case '-':
      return 'zoom-out';
    case '0':
      return 'fit-width';
    default:
      return null;
  }
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target) || document.querySelector('dialog:modal'))
        return;
      const action = resolveShortcut(event);
      if (!action) return;
      event.preventDefault();
      const reader = useReaderStore.getState();
      const history = useHistoryStore.getState();
      switch (action) {
        case 'bookmark':
          useBookmarksStore.getState().toggle(reader.location.page);
          break;
        case 'note': {
          const notes = useNotesStore.getState();
          if (reader.docId && notes.docId === reader.docId && !addNoteFromSelection()) {
            const center = reader.controller?.getVisibleCenter() ?? reader.location;
            notes.addNote({ page: center.page, y: center.offset });
          }
          break;
        }
        case 'page':
          document.getElementById('page-field')?.focus();
          break;
        case 'sidebar':
          reader.toggleSidebar();
          break;
        case 'review':
          if (reader.docId) navigate({ name: 'review', docId: reader.docId });
          break;
        case 'back':
          history.goBack();
          break;
        case 'forward':
          history.goForward();
          break;
        case 'zoom-in':
          zoomIn();
          break;
        case 'zoom-out':
          zoomOut();
          break;
        case 'fit-width':
          setZoomMode('fit-width');
          break;
        case 'dismiss':
          history.dismissReturn();
          break;
        case 'help':
          openShortcutsDialog();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
