import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  Bookmark,
  BookOpen,
  FileDown,
  FileText,
  FlaskConical,
  Highlighter,
  Keyboard,
  LibraryBig,
  Maximize,
  Moon,
  NotebookPen,
  NotebookText,
  PanelLeft,
  Pin,
  Search,
  Sun,
  Sunrise,
  Volume2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { navigate, useRoute } from '@/app/router';
import { useSettingsStore } from '@/app/settingsStore';
import { useBookmarksStore } from '@/features/navigation/bookmarksStore';
import { useHistoryStore } from '@/features/navigation/historyStore';
import { formatPageRef, resolvePageInput } from '@/features/navigation/pageLabels';
import { openShortcutsDialog } from '@/features/navigation/ShortcutsDialog';
import { useHighlightsStore } from '@/features/notes/highlightsStore';
import { useNotesStore } from '@/features/notes/notesStore';
import { jumpToHighlightInBook, jumpToNote } from '@/features/notes/reviewActions';
import { addNoteFromSelection } from '@/features/notes/selectionNote';
import { useReaderStore } from '@/features/reader/readerStore';
import { setZoomMode, zoomIn, zoomOut } from '@/features/reader/zoom';
import { focusSearchInput } from '@/features/search/searchDom';
import { useSearchStore } from '@/features/search/searchStore';
import { flattenOutline, sectionForPage } from '@/lib/pdf/outline';
import { listDocuments } from '@/lib/storage/repository';
import type { LibraryDocument, ReadingLocation } from '@/lib/types';
import { isExperimentOn, openExperimentsLab, useExperimentsStore } from '../experimentsStore';
import { emitExperimentEvent, EXPERIMENT_EVENTS } from '../shared/events';
import { matchPrepared, normalizeQuery, prepareFuzzyText, type FuzzyMatch, type FuzzyText } from './fuzzy';
import './palette.css';

type Group = 'Contents' | 'Pages' | 'Bookmarks' | 'Notes & highlights' | 'Books' | 'Actions';
const GROUPS: Group[] = ['Contents', 'Pages', 'Bookmarks', 'Notes & highlights', 'Books', 'Actions'];

interface Item {
  id: string;
  group: Group;
  title: string;
  detail?: string;
  Icon: LucideIcon;
  hint?: string;
  run(): void;
  preparedTitle: FuzzyText;
  preparedDetail?: FuzzyText;
}

type ItemInput = Omit<Item, 'preparedTitle' | 'preparedDetail'>;
interface Result {
  item: Item;
  score: number;
  titleMatch?: FuzzyMatch;
  detailMatch?: FuzzyMatch;
}

function item(input: ItemInput): Item {
  return {
    ...input,
    preparedTitle: prepareFuzzyText(input.title),
    preparedDetail: input.detail ? prepareFuzzyText(input.detail) : undefined,
  };
}

function jump(location: ReadingLocation, docId: string): void {
  useHistoryStore.getState().jumpTo(location);
  navigate({ name: 'reader', docId });
}

function openSearch(query?: string): void {
  const reader = useReaderStore.getState();
  if (!reader.docId) return;
  navigate({ name: 'reader', docId: reader.docId });
  reader.setSidebarTab('search');
  if (query !== undefined) {
    useSearchStore.getState().setQuery(query);
    useSearchStore.getState().commitQuery();
  }
  focusSearchInput();
}

function MarkedText({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices?.length) return text;
  const matched = new Set(indices);
  const parts: ReactNode[] = [];
  let offset = 0;
  let start = 0;
  let wasMatched = matched.has(0);
  for (const char of text) {
    const isMatched = matched.has(offset);
    if (isMatched !== wasMatched) {
      const segment = text.slice(start, offset);
      parts.push(wasMatched ? <mark key={start}>{segment}</mark> : segment);
      start = offset;
      wasMatched = isMatched;
    }
    offset += char.length;
  }
  const segment = text.slice(start);
  parts.push(wasMatched ? <mark key={start}>{segment}</mark> : segment);
  return parts;
}

export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const route = useRoute();
  const reader = useReaderStore();
  const notes = useNotesStore((s) => s.notes);
  const highlights = useHighlightsStore((s) => s.highlights);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const theme = useSettingsStore((s) => s.theme);
  const flags = useExperimentsStore((s) => s.enabled);
  const back = useHistoryStore((s) => s.back);
  const forward = useHistoryStore((s) => s.forward);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [books, setBooks] = useState<LibraryDocument[]>([]);
  const isReader = route.name === 'reader' && reader.status === 'ready';
  const hasBook = route.name !== 'library' && reader.status === 'ready' && !!reader.docId;

  const dismiss = useCallback((restore = true) => {
    if (dialog.current?.open) dialog.current.close();
    setOpen(false);
    if (restore && opener.current?.isConnected) {
      opener.current.focus({ preventScroll: true });
    } else if (!restore) {
      const viewport = document.querySelector<HTMLElement>('.reader__viewport');
      if (viewport) viewport.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    opener.current = null;
  }, []);

  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      const element = dialog.current;
      if (!element) return;
      const otherModal = document.querySelector('dialog:modal');
      if (otherModal && otherModal !== element) return;
      event.preventDefault();
      event.stopPropagation();
      if (element.open) {
        dismiss();
        return;
      }
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery('');
      setActive(0);
      element.showModal();
      setOpen(true);
      input.current?.focus();
    };
    window.addEventListener('keydown', handleKey, true);
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      if (dialog.current?.open) dialog.current.close();
    };
  }, [dismiss]);

  useEffect(() => {
    if (!open || route.name !== 'library') return;
    let cancelled = false;
    void listDocuments()
      .then((documents) => {
        if (!cancelled) setBooks(documents);
      })
      .catch(() => {
        if (!cancelled) setBooks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, route.name]);

  const flattened = useMemo(() => flattenOutline(reader.outline), [reader.outline]);
  const suggestions = useMemo(() => {
    if (!open) return [];
    let current = -1;
    for (let i = 0; i < flattened.length; i++) {
      if (flattened[i].location!.page <= reader.location.page) current = i;
    }
    if (current < 0 || flattened[current].depth === 0) return flattened.filter((entry) => entry.depth === 0);
    const depth = flattened[current].depth;
    let start = current;
    while (start > 0 && flattened[start - 1].depth >= depth) start--;
    let end = current + 1;
    while (end < flattened.length && flattened[end].depth >= depth) end++;
    return flattened.slice(start, end).filter((entry) => entry.depth === depth);
  }, [open, flattened, reader.location.page]);

  const candidates = useMemo(() => {
    if (!open) return [];
    const result: Item[] = [];
    const add = (input: ItemInput) => result.push(item(input));
    const docId = hasBook ? reader.docId : null;
    if (docId) {
      for (const [index, entry] of flattened.entries()) {
        add({
          id: `outline-${index}`,
          group: 'Contents',
          title: entry.title,
          detail: formatPageRef(reader.pageLabels, entry.location!.page),
          Icon: BookOpen,
          run: () => jump(entry.location!, docId),
        });
      }
      for (const bookmark of [...bookmarks].sort((a, b) => b.createdAt - a.createdAt)) {
        add({
          id: `bookmark-${bookmark.id}`,
          group: 'Bookmarks',
          title: bookmark.label,
          detail: formatPageRef(reader.pageLabels, bookmark.page),
          Icon: Bookmark,
          run: () => jump({ page: bookmark.page, offset: 0 }, docId),
        });
      }
      for (const note of notes) {
        add({
          id: `note-${note.id}`,
          group: 'Notes & highlights',
          title: note.text.trim() || note.quote || 'Empty note',
          detail: `${formatPageRef(reader.pageLabels, note.page)}${note.text.trim() && note.quote ? ` · ${note.quote}` : ''}`,
          Icon: NotebookPen,
          run: () => jumpToNote(note),
        });
      }
      for (const highlight of highlights) {
        add({
          id: `highlight-${highlight.id}`,
          group: 'Notes & highlights',
          title: highlight.text || 'Highlight',
          detail: formatPageRef(reader.pageLabels, highlight.page),
          Icon: Highlighter,
          run: () => jumpToHighlightInBook(highlight),
        });
      }
    } else if (route.name === 'library') {
      for (const book of books) {
        add({
          id: `book-${book.id}`,
          group: 'Books',
          title: book.title,
          detail: `${book.pageCount} pages`,
          Icon: BookMarked,
          run: () => navigate({ name: 'reader', docId: book.id }),
        });
      }
    }

    const action = (id: string, title: string, Icon: LucideIcon, run: () => void, hint?: string) =>
      add({ id, group: 'Actions', title, Icon, run, hint });
    if (isReader && docId) {
      action(
        'bookmark',
        'Toggle bookmark',
        Bookmark,
        () => {
          useBookmarksStore.getState().toggle(useReaderStore.getState().location.page);
        },
        'B',
      );
      action(
        'note',
        'New margin note',
        NotebookPen,
        () => {
          const state = useReaderStore.getState();
          const store = useNotesStore.getState();
          if (store.docId !== state.docId || !state.docId) return;
          if (!addNoteFromSelection()) {
            const center = state.controller?.getVisibleCenter() ?? state.location;
            store.addNote({ page: center.page, y: center.offset });
          }
        },
        'N',
      );
      action('sidebar', 'Toggle sidebar', PanelLeft, () => useReaderStore.getState().toggleSidebar(), '[');
      action('review', 'Review notes', NotebookText, () => navigate({ name: 'review', docId }), 'Shift+R');
      action('search', 'Search the book', Search, () => openSearch(), 'Ctrl+F');
      action('zoom-in', 'Zoom in', ZoomIn, zoomIn, '+');
      action('zoom-out', 'Zoom out', ZoomOut, zoomOut, '−');
      action('fit', 'Fit width', Maximize, () => setZoomMode('fit-width'), '0');
      if (back.length)
        action('back', 'Go back', ArrowLeft, () => useHistoryStore.getState().goBack(), 'Alt+←');
      if (forward.length)
        action('forward', 'Go forward', ArrowRight, () => useHistoryStore.getState().goForward(), 'Alt+→');
      action('shortcuts', 'Keyboard shortcuts', Keyboard, openShortcutsDialog, '?');
    }
    if (hasBook && !isReader && docId) {
      action('reader', 'Back to book', BookOpen, () => navigate({ name: 'reader', docId }));
      action('search', 'Search the book', Search, () => openSearch(), 'Ctrl+F');
    }
    action('light', 'Theme: Light', Sun, () => useSettingsStore.getState().setTheme('light'));
    action('sepia', 'Theme: Sepia', Sunrise, () => useSettingsStore.getState().setTheme('sepia'));
    action('dark', 'Theme: Dark', Moon, () => useSettingsStore.getState().setTheme('dark'));
    if (theme === 'dark') {
      action('invert', 'Invert page colours', Moon, () => {
        const settings = useSettingsStore.getState();
        settings.setInvertPagesInDark(!settings.invertPagesInDark);
      });
    }
    action('lab', 'Open Experiments lab', FlaskConical, openExperimentsLab);
    if (hasBook) action('library', 'Back to library', LibraryBig, () => navigate({ name: 'library' }));

    if (hasBook) {
      if (isExperimentOn('flashcards'))
        action('flashcards', 'Study flashcards', BookMarked, () =>
          emitExperimentEvent(EXPERIMENT_EVENTS.studyFlashcards),
        );
      if (isReader && isExperimentOn('focus-mode'))
        action(
          'focus',
          'Toggle focus mode',
          Maximize,
          () => emitExperimentEvent(EXPERIMENT_EVENTS.toggleFocus),
          'F',
        );
      if (isReader && isExperimentOn('pinned-pane'))
        action('pin', 'Pin this page', Pin, () => emitExperimentEvent(EXPERIMENT_EVENTS.pinPage), 'P');
      if (isReader && isExperimentOn('read-aloud'))
        action(
          'read-aloud',
          'Read aloud',
          Volume2,
          () => emitExperimentEvent(EXPERIMENT_EVENTS.toggleReadAloud),
          'Shift+A',
        );
      if (isExperimentOn('pdf-export'))
        action('pdf-export', 'Export annotated PDF', FileDown, () =>
          emitExperimentEvent(EXPERIMENT_EVENTS.exportAnnotatedPdf),
        );
    }
    return result;
  }, [
    open,
    hasBook,
    isReader,
    reader.docId,
    reader.outline,
    reader.pageLabels,
    flattened,
    bookmarks,
    notes,
    highlights,
    route.name,
    books,
    theme,
    back,
    forward,
    flags,
  ]);

  const results = useMemo(() => {
    if (!open) return [];
    const needle = normalizeQuery(query);
    const groups = new Map<Group, Result[]>();
    const addRanked = (group: Group, row: Result) => {
      let list = groups.get(group);
      if (!list) {
        list = [];
        groups.set(group, list);
      }
      const index = list.findIndex((existing) => row.score > existing.score);
      if (index < 0) {
        if (list.length < 8) list.push(row);
      } else {
        list.splice(index, 0, row);
        if (list.length > 8) list.pop();
      }
    };
    const suggested = new Set(suggestions.map((entry) => entry.location));
    const recent = new Set(
      [...bookmarks]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map((b) => `bookmark-${b.id}`),
    );
    let actions = 0;
    for (const candidate of candidates) {
      if (!needle) {
        if (candidate.group === 'Contents') {
          const index = Number(candidate.id.slice('outline-'.length));
          if (!suggested.has(flattened[index]?.location)) continue;
        } else if (candidate.group === 'Bookmarks' && !recent.has(candidate.id)) continue;
        else if (candidate.group === 'Notes & highlights') continue;
        else if (candidate.group === 'Actions' && actions++ >= 6) continue;
        addRanked(candidate.group, { item: candidate, score: 0 });
        continue;
      }
      const titleMatch = matchPrepared(needle, candidate.preparedTitle);
      const detailMatch = candidate.preparedDetail ? matchPrepared(needle, candidate.preparedDetail) : null;
      if (!titleMatch && !detailMatch) continue;
      const score = Math.max(titleMatch?.score ?? -Infinity, (detailMatch?.score ?? -Infinity) - 5);
      addRanked(candidate.group, {
        item: candidate,
        score,
        titleMatch: titleMatch ?? undefined,
        detailMatch: detailMatch ?? undefined,
      });
    }
    if (needle && hasBook && reader.docId) {
      const pageInput = query.trim().replace(/^p(?:age)?\.?\s*/i, '');
      const page = resolvePageInput(
        reader.pageLabels,
        pageInput,
        reader.pdf?.numPages ?? reader.doc?.pageCount ?? 0,
      );
      if (page !== null) {
        const docId = reader.docId;
        groups.set('Pages', [
          {
            item: item({
              id: 'page',
              group: 'Pages',
              title: `Go to ${formatPageRef(reader.pageLabels, page)}`,
              detail: sectionForPage(reader.outline, page) ?? undefined,
              Icon: FileText,
              run: () => jump({ page, offset: 0 }, docId),
            }),
            score: 10000,
          },
        ]);
      }
    }
    const ordered = GROUPS.map((group) => ({
      group,
      rows: groups.get(group) ?? [],
    })).filter((group) => group.rows.length);
    if (needle) ordered.sort((a, b) => b.rows[0].score - a.rows[0].score);
    let remaining = needle && hasBook ? 39 : 40;
    for (const group of ordered) {
      group.rows = group.rows.slice(0, remaining);
      remaining -= group.rows.length;
    }
    if (needle && hasBook) {
      ordered.push({
        group: 'Actions',
        rows: [
          {
            item: item({
              id: 'search-fallback',
              group: 'Actions',
              title: `Search the book for “${query.trim()}”`,
              Icon: Search,
              run: () => openSearch(query.trim()),
            }),
            score: -Infinity,
          },
        ],
      });
    }
    return ordered.filter((group) => group.rows.length);
  }, [
    open,
    query,
    candidates,
    suggestions,
    bookmarks,
    flattened,
    hasBook,
    reader.docId,
    reader.pageLabels,
    reader.pdf,
    reader.doc,
    reader.outline,
  ]);

  const rows = results.flatMap((group) => group.rows);
  const activeIndex = Math.min(active, Math.max(0, rows.length - 1));
  useEffect(() => {
    if (open)
      document.getElementById(`command-palette-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, results]);

  const run = (row: Result) => {
    dismiss(false);
    row.item.run();
  };
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (
      event.key === 'ArrowDown' ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n')
    ) {
      event.preventDefault();
      setActive((activeIndex + 1) % Math.max(rows.length, 1));
    } else if (
      event.key === 'ArrowUp' ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p')
    ) {
      event.preventDefault();
      setActive((activeIndex - 1 + Math.max(rows.length, 1)) % Math.max(rows.length, 1));
    } else if (event.key === 'Enter' && rows[activeIndex]) {
      event.preventDefault();
      run(rows[activeIndex]);
    }
  };

  let index = 0;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes the dialog through onCancel and the input handler.
    <dialog
      ref={dialog}
      className="command-palette"
      aria-label="Command palette"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dismiss();
      }}
    >
      <div className="command-palette__search">
        <Search aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-label="Search commands and destinations"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="command-palette-list"
          aria-activedescendant={rows.length ? `command-palette-option-${activeIndex}` : undefined}
          placeholder="Jump to a chapter, page or note — or type a command"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKeyDown}
        />
        <kbd className="kbd">Esc</kbd>
      </div>
      <div
        id="command-palette-list"
        className="command-palette__list"
        role="listbox"
        aria-label="Commands and destinations"
      >
        {results.map((group, groupIndex) => (
          <div
            role="group"
            aria-labelledby={`command-palette-group-${groupIndex}`}
            key={`${group.group}-${group.rows[0].item.id === 'search-fallback' ? 'fallback' : 'results'}`}
          >
            <div className="command-palette__heading" id={`command-palette-group-${groupIndex}`}>
              {group.group}
            </div>
            {group.rows.map((row) => {
              const rowIndex = index++;
              const Icon = row.item.Icon;
              return (
                <div
                  id={`command-palette-option-${rowIndex}`}
                  key={row.item.id}
                  role="option"
                  aria-selected={rowIndex === activeIndex}
                  tabIndex={-1}
                  className={`command-palette__row${rowIndex === activeIndex ? ' is-active' : ''}`}
                  onMouseMove={() => setActive(rowIndex)}
                  onClick={() => run(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      run(row);
                    }
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span className="command-palette__row-text">
                    <span className="command-palette__title">
                      <MarkedText text={row.item.title} indices={row.titleMatch?.indices} />
                    </span>
                    {row.item.detail && (
                      <span className="command-palette__detail">
                        <MarkedText text={row.item.detail} indices={row.detailMatch?.indices} />
                      </span>
                    )}
                  </span>
                  {row.item.hint && <kbd className="kbd">{row.item.hint}</kbd>}
                </div>
              );
            })}
          </div>
        ))}
        {!rows.length && <p className="command-palette__empty">No matching commands or destinations.</p>}
      </div>
      <footer className="command-palette__footer">↑↓ to move · Enter to open · Esc to close</footer>
    </dialog>
  );
}
