import { useEffect } from 'react';
import { navigate } from '@/app/router';
import { useSettingsStore } from '@/app/settingsStore';
import { isEditableTarget } from '@/lib/util';
import type { CommandId } from '../commands/commands';
import { type KeyEvent, matches } from '../commands/keys';
import { exitFocusMode, toggleFocusMode, useFocusStore } from '../focus/focusStore';
import { useNotesStore } from '../notes/notesStore';
import { addNoteFromSelection } from '../notes/selectionNote';
import { openGoTo } from '../palette/paletteStore';
import { useReaderStore } from '../reader/readerStore';
import { setZoomMode, zoomIn, zoomOut } from '../reader/zoom';
import { useBookmarksStore } from './bookmarksStore';
import { useHistoryStore } from './historyStore';
import { openShortcutsDialog } from './ShortcutsDialog';

/** The reader's single-key commands; search and highlighting have hooks of their own. */
const READER_SHORTCUTS = [
  'bookmark',
  'note',
  'go-to',
  'focus',
  'ruler',
  'sidebar',
  'review',
  'back',
  'forward',
  'zoom-in',
  'zoom-out',
  'fit-width',
  'dismiss',
  'help',
] as const satisfies readonly CommandId[];

export type ShortcutAction = (typeof READER_SHORTCUTS)[number];

export function resolveShortcut(event: KeyEvent): ShortcutAction | null {
  return READER_SHORTCUTS.find((id) => matches(event, id)) ?? null;
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
        case 'go-to':
          openGoTo();
          break;
        case 'focus':
          toggleFocusMode();
          break;
        case 'ruler':
          useSettingsStore.getState().toggle('readingRuler');
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
          if (useFocusStore.getState().active) exitFocusMode();
          else history.dismissReturn();
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
