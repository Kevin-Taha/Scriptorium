import { navigate } from '@/app/router';
import { useSettingsStore } from '@/app/settingsStore';
import type { CommandId } from '@/features/commands/commands';
import { keyLabel } from '@/features/commands/keys';
import { toggleFocusMode, useFocusStore } from '@/features/focus/focusStore';
import { useBookmarksStore } from '@/features/navigation/bookmarksStore';
import { useHistoryStore } from '@/features/navigation/historyStore';
import { formatPageRef, resolvePageInput } from '@/features/navigation/pageLabels';
import { openShortcutsDialog } from '@/features/navigation/ShortcutsDialog';
import { useHighlightsStore } from '@/features/notes/highlightsStore';
import { plainNoteText } from '@/features/notes/noteFormat';
import { useNotesStore } from '@/features/notes/notesStore';
import { jumpToHighlightInBook, jumpToNote } from '@/features/notes/reviewActions';
import { addNoteFromSelection } from '@/features/notes/selectionNote';
import { useReaderStore } from '@/features/reader/readerStore';
import { setZoomMode, zoomIn, zoomOut } from '@/features/reader/zoom';
import { buildSnippet } from '@/features/search/matcher';
import { chooseMatch, flatIndexOf, sliceHits, type SearchState } from '@/features/search/searchStore';
import { openLibraryStorageDialog } from '@/features/settings/storageDialogStore';
import { chapterEntries, flattenOutline, sectionForPage } from '@/lib/pdf/outline';
import type { OutlineItem, ReadingLocation } from '@/lib/types';
import { matchPrepared, normalizeQuery, prepareFuzzyText, type FuzzyText } from './fuzzy';

export type Group = 'Contents' | 'Bookmarks' | 'Notes & highlights' | 'Actions';
const GROUPS: Group[] = ['Contents', 'Bookmarks', 'Notes & highlights', 'Actions'];
/** Rows per group of destinations; text matches have their own limit. */
const GROUP_ROWS = 8;
export const TEXT_ROWS = 50;

export interface Destination {
  id: string;
  icon: 'page' | 'contents' | 'bookmark' | 'note' | 'highlight' | 'action' | 'text';
  title: string;
  detail?: string;
  hint?: string;
  run(): void;
}

export interface Row {
  item: Destination;
  /** Offsets of the characters to emphasise. */
  titleMarks?: number[];
  detailMarks?: number[];
  /** The search match F3 steps on from. */
  current?: boolean;
}

export interface Candidate extends Destination {
  group: Group;
  /** Listed before anything is typed. */
  suggested?: boolean;
  current?: boolean;
  titleText: FuzzyText;
  detailText?: FuzzyText;
}

export function candidate(input: Omit<Candidate, 'titleText' | 'detailText'>): Candidate {
  return {
    ...input,
    titleText: prepareFuzzyText(input.title),
    detailText: input.detail ? prepareFuzzyText(input.detail) : undefined,
  };
}

/** What Go to needs from the open book, read once when it opens. */
export interface Book {
  labels: readonly string[] | null;
  outline: OutlineItem[];
  count: number;
}

export function readBook(): Book {
  const { pageLabels, outline, pdf, doc } = useReaderStore.getState();
  return { labels: pageLabels, outline, count: pdf?.numPages ?? doc?.pageCount ?? 0 };
}

const pageRef = (book: Book, page: number) => {
  const section = sectionForPage(book.outline, page);
  return `${formatPageRef(book.labels, page)}${section ? ` · ${section}` : ''}`;
};

export function pageQuery(labels: readonly string[] | null, query: string, count: number): number | null {
  const trimmed = query.trim();
  const direct = resolvePageInput(labels, trimmed, count);
  if (direct !== null) return direct;
  const prefix = /^(?:p\.?|page)\s+(.+)$/i.exec(trimmed);
  return prefix ? resolvePageInput(labels, prefix[1], count) : null;
}

/** "Go to p. 37" when the query names a page. */
export function pageRow(book: Book, query: string): Row | null {
  const page = pageQuery(book.labels, query, book.count);
  if (page === null) return null;
  return {
    item: {
      id: 'page',
      icon: 'page',
      title: `Go to ${pageRef(book, page)}`,
      run: () => useHistoryStore.getState().jumpTo({ page, offset: 0 }),
    },
  };
}

/** Matching candidates by group, best group first; with an empty query, the suggestions. Ties keep their order. */
export function rankCandidates(candidates: Candidate[], query: string): { name: Group; rows: Row[] }[] {
  const needle = normalizeQuery(query);
  const ranked = new Map<Group, (Row & { score: number })[]>();
  for (const item of candidates) {
    if (!needle && !item.suggested) continue;
    const titleMatch = needle ? matchPrepared(needle, item.titleText) : null;
    const detailMatch = needle && item.detailText ? matchPrepared(needle, item.detailText) : null;
    if (needle && !titleMatch && !detailMatch) continue;
    const score = needle
      ? Math.max(titleMatch?.score ?? -Infinity, (detailMatch?.score ?? -Infinity) - 5)
      : Number(!!item.current);
    const rows = ranked.get(item.group) ?? [];
    const at = rows.findIndex((other) => score > other.score);
    rows.splice(at < 0 ? rows.length : at, 0, {
      item,
      score,
      titleMarks: titleMatch?.indices,
      detailMarks: detailMatch?.indices,
    });
    if (rows.length > GROUP_ROWS) rows.pop();
    ranked.set(item.group, rows);
  }
  const groups = GROUPS.flatMap((name) => {
    const rows = ranked.get(name);
    return rows ? [{ name, rows }] : [];
  });
  if (needle) groups.sort((a, b) => b.rows[0].score - a.rows[0].score);
  return groups;
}

/** Up to {@link TEXT_ROWS} matches as snippets, from the first one (or the chosen one, when that is further on). */
export function textRows(
  { results, hits, active }: Pick<SearchState, 'results' | 'hits' | 'active'>,
  book: Book,
): Row[] {
  const at = flatIndexOf(results, active);
  const from = at < TEXT_ROWS ? 0 : Math.min(at, hits - TEXT_ROWS);
  return sliceHits(results, from, TEXT_ROWS).map((hit) => {
    const result = results.find((candidate) => candidate.page === hit.page)!;
    const { start, end } = result.matches[hit.index];
    const { before, match, after } = buildSnippet(result.text.text, start, end);
    return {
      item: {
        id: `text-${hit.page}-${hit.index}`,
        icon: 'text',
        title: before + match + after,
        detail: pageRef(book, hit.page),
        run: () => chooseMatch(hit),
      },
      titleMarks: Array.from({ length: match.length }, (_, i) => before.length + i),
      current: active?.page === hit.page && active.index === hit.index,
    };
  });
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
