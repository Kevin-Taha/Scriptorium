import { navigate } from '@/app/router';
import { useSettingsStore } from '@/app/settingsStore';
import type { CommandId } from '@/features/commands/commands';
import { keyLabel } from '@/features/commands/keys';
import { toggleFocusMode, useFocusStore } from '@/features/focus/focusStore';
import { useBookmarksStore } from '@/features/navigation/bookmarksStore';
import { useHistoryStore } from '@/features/navigation/historyStore';
import { formatPageRef } from '@/features/navigation/pageLabels';
import { openShortcutsDialog } from '@/features/navigation/ShortcutsDialog';
import { useHighlightsStore } from '@/features/notes/highlightsStore';
import { plainNoteText } from '@/features/notes/noteFormat';
import { useNotesStore } from '@/features/notes/notesStore';
import { jumpToHighlightInBook, jumpToNote } from '@/features/notes/reviewActions';
import { addNoteFromSelection } from '@/features/notes/selectionNote';
import { useReaderStore } from '@/features/reader/readerStore';
import { setZoomMode, zoomIn, zoomOut } from '@/features/reader/zoom';
import { focusSearchInput } from '@/features/search/searchDom';
import { useSearchStore } from '@/features/search/searchStore';
import { openLibraryStorageDialog } from '@/features/settings/storageDialogStore';
import { chapterEntries, flattenOutline } from '@/lib/pdf/outline';
import type { ReadingLocation } from '@/lib/types';
import { candidate, type Candidate } from './results';

export function openBookSearch(query?: string): void {
  useReaderStore.getState().setSidebarTab('search');
  if (query !== undefined) {
    useSearchStore.getState().setQuery(query);
    useSearchStore.getState().commitQuery();
  }
  focusSearchInput();
}

/** Snapshot searchable data once when the palette opens, rather than on every keystroke. */
export function buildCandidates(): Candidate[] {
  const reader = useReaderStore.getState();
  const settings = useSettingsStore.getState();
  const bookmarks = useBookmarksStore.getState().bookmarks;
  const notes = useNotesStore.getState().notes;
  const highlights = useHighlightsStore.getState().highlights;
  const outline = flattenOutline(reader.outline);
  // Flattened entries are copies of the outline's, but share their location objects.
  const chapters = chapterEntries(reader.outline);
  const chapterStarts = new Set<ReadingLocation | null>(chapters.map((chapter) => chapter.location));
  const currentStart = chapters.findLast(
    (chapter) => chapter.location.page <= reader.location.page,
  )?.location;
  const items: Candidate[] = [];
  const add = (input: Parameters<typeof candidate>[0]) => items.push(candidate(input));
  for (const [index, entry] of outline.entries()) {
    const isCurrent = entry.location === currentStart;
    add({
      id: `outline-${index}`,
      group: 'Contents',
      title: entry.title,
      detail: `${formatPageRef(reader.pageLabels, entry.location!.page)}${isCurrent ? ' · Current chapter' : ''}`,
      icon: 'contents',
      suggested: chapterStarts.has(entry.location),
      current: isCurrent,
      run: () => useHistoryStore.getState().jumpTo(entry.location!),
    });
  }
  for (const bookmark of bookmarks) {
    add({
      id: `bookmark-${bookmark.id}`,
      group: 'Bookmarks',
      title: bookmark.label,
      detail: formatPageRef(reader.pageLabels, bookmark.page),
      icon: 'bookmark',
      run: () => useHistoryStore.getState().jumpTo({ page: bookmark.page, offset: 0 }),
    });
  }
  for (const note of notes) {
    const text = plainNoteText(note.text).trim();
    add({
      id: `note-${note.id}`,
      group: 'Notes & highlights',
      title: text || note.quote || 'Empty note',
      detail: `${formatPageRef(reader.pageLabels, note.page)}${text && note.quote ? ` · ${note.quote}` : ''}`,
      icon: 'note',
      run: () => jumpToNote(note),
    });
  }
  for (const highlight of highlights) {
    add({
      id: `highlight-${highlight.id}`,
      group: 'Notes & highlights',
      title: highlight.text || 'Highlight',
      detail: formatPageRef(reader.pageLabels, highlight.page),
      icon: 'highlight',
      run: () => jumpToHighlightInBook(highlight),
    });
  }

  const action = (id: string, title: string, run: () => void, command?: CommandId, suggested = false) =>
    add({ id, group: 'Actions', title, icon: 'action', run, hint: command && keyLabel(command), suggested });
  const marked = bookmarks.some((bookmark) => bookmark.page === reader.location.page);
  action(
    'bookmark',
    marked ? 'Remove bookmark' : 'Bookmark this page',
    () => {
      useBookmarksStore.getState().toggle(useReaderStore.getState().location.page);
    },
    'bookmark',
    true,
  );
  action(
    'note',
    'New margin note',
    () => {
      const state = useReaderStore.getState();
      const store = useNotesStore.getState();
      if (!state.docId || store.docId !== state.docId) return;
      if (!addNoteFromSelection()) {
        const center = state.controller?.getVisibleCenter() ?? state.location;
        store.addNote({ page: center.page, y: center.offset });
      }
    },
    'note',
    true,
  );
  action(
    'focus',
    useFocusStore.getState().active ? 'Exit focus mode' : 'Enter focus mode',
    toggleFocusMode,
    'focus',
    true,
  );
  action(
    'ruler',
    settings.readingRuler ? 'Hide reading ruler' : 'Show reading ruler',
    () => useSettingsStore.getState().toggle('readingRuler'),
    'ruler',
    true,
  );
  action('search', 'Search the book', () => openBookSearch(), 'search', true);
  action(
    'review',
    'Review notes',
    () => {
      const docId = useReaderStore.getState().docId;
      if (docId) navigate({ name: 'review', docId });
    },
    'review',
    true,
  );
  action('map', settings.bookMap ? 'Hide book map' : 'Show book map', () =>
    useSettingsStore.getState().toggle('bookMap'),
  );
  action('progress', settings.chapterProgress ? 'Hide chapter progress' : 'Show chapter progress', () =>
    useSettingsStore.getState().toggle('chapterProgress'),
  );
  action(
    'sidebar',
    reader.sidebarOpen ? 'Hide sidebar' : 'Show sidebar',
    () => useReaderStore.getState().toggleSidebar(),
    'sidebar',
  );
  action('zoom-in', 'Zoom in', zoomIn, 'zoom-in');
  action('zoom-out', 'Zoom out', zoomOut, 'zoom-out');
  action('fit', 'Fit width', () => setZoomMode('fit-width'), 'fit-width');
  action('light', 'Theme: Light', () => useSettingsStore.getState().setTheme('light'));
  action('sepia', 'Theme: Sepia', () => useSettingsStore.getState().setTheme('sepia'));
  action('dark', 'Theme: Dark', () => useSettingsStore.getState().setTheme('dark'));
  if (settings.theme === 'dark')
    action('invert', settings.invertPagesInDark ? 'Restore page colours' : 'Invert page colours', () =>
      useSettingsStore.getState().toggle('invertPagesInDark'),
    );
  action('shortcuts', 'Keyboard shortcuts', openShortcutsDialog, 'help');
  action('storage', 'Library & storage', () => openLibraryStorageDialog());
  action('library', 'Back to library', () => navigate({ name: 'library' }));
  if (useHistoryStore.getState().back.length)
    action('back', 'Go back', () => useHistoryStore.getState().goBack(), 'back');
  if (useHistoryStore.getState().forward.length)
    action('forward', 'Go forward', () => useHistoryStore.getState().goForward(), 'forward');
  return items;
}
