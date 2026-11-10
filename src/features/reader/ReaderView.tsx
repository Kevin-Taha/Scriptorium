import { useCallback, useEffect, useMemo } from 'react';
import { LibraryBig, NotebookText, PanelLeft, Search } from 'lucide-react';
import { AppearanceMenu } from '@/app/AppearanceMenu';
import { navigate } from '@/app/router';
import { usePagesInverted, useSettingsStore } from '@/app/settingsStore';
import { sectionForPage } from '@/lib/pdf/outline';
import { BookMap } from '../bookmap/BookMap';
import { ariaKeyShortcuts, keyLabel, withShortcut } from '../commands/keys';
import { DefineCard } from '../define/DefineCard';
import { FocusMode } from '../focus/FocusMode';
import { ReadingRuler } from '../focus/ReadingRuler';
import { BookmarkRibbon, useRibbonReveal } from '../navigation/BookmarkRibbon';
import { BookmarksPanel } from '../navigation/BookmarksPanel';
import { ChapterProgress } from '../navigation/ChapterProgress';
import { HistoryButtons } from '../navigation/HistoryButtons';
import { useHistoryStore } from '../navigation/historyStore';
import { OutlinePanel } from '../navigation/OutlinePanel';
import { PageIndicator } from '../navigation/PageIndicator';
import { ReturnPill } from '../navigation/ReturnPill';
import { useKeyboardShortcuts } from '../navigation/useKeyboardShortcuts';
import { MarginColumn } from '../notes/MarginColumn';
import { NotesPanel } from '../notes/NotesPanel';
import { useNotesStore } from '../notes/notesStore';
import { useHighlightsStore } from '../notes/highlightsStore';
import { PageHighlights } from '../notes/PageHighlights';
import { PageNoteMarkers } from '../notes/PageNoteMarkers';
import { SelectionNotePopover } from '../notes/SelectionNotePopover';
import { GoToPalette } from '../palette/GoToPalette';
import { openGoTo } from '../palette/paletteStore';
import { SearchHighlights } from '../search/SearchHighlights';
import { useSearchShortcut } from '../search/useSearchShortcut';
import { closeSidebarIfOverlay, SIDEBAR_OVERLAY_QUERY, useReaderStore, type SidebarTab } from './readerStore';
import { Viewer, type PageSize } from './Viewer';
import './reader.css';

const renderMargin = (page: number, size: PageSize) => <MarginColumn page={page} size={size} />;
const renderPageOverlay = (page: number, size: PageSize) => (
  <>
    <PageHighlights page={page} size={size} />
    <SearchHighlights page={page} size={size} />
    <PageNoteMarkers page={page} size={size} />
    <BookmarkRibbon page={page} />
  </>
);

export function ReaderView() {
  const pdf = useReaderStore((s) => s.pdf)!;
  const sidebarOpen = useReaderStore((s) => s.sidebarOpen);
  const jumpTo = useHistoryStore((s) => s.jumpTo);
  const inverted = usePagesInverted();
  const bookMap = useSettingsStore((s) => s.bookMap);
  const readingRuler = useSettingsStore((s) => s.readingRuler);
  useKeyboardShortcuts();
  useSearchShortcut();
  useRibbonReveal();

  return (
    <div className={`reader${inverted ? ' invert-pages' : ''}`} data-sidebar-open={sidebarOpen}>
      <ReaderToolbar />
      <div className="reader__body">
        {sidebarOpen && <ReaderSidebar />}
        <main className="reader__main" aria-label="Document">
          <Viewer
            pdf={pdf}
            onLinkClick={jumpTo}
            renderMargin={renderMargin}
            renderPageOverlay={renderPageOverlay}
          />
          {/* Mounted after the ruler so the map (and its preview card) paint above the ruler's veil. */}
          {readingRuler && <ReadingRuler />}
          {bookMap && <BookMap />}
          <ReturnPill />
          <SelectionNotePopover />
          <DefineCard />
        </main>
      </div>
      <FocusMode />
      <GoToPalette />
    </div>
  );
}

function ReaderToolbar() {
  const doc = useReaderStore((s) => s.doc);
  const docId = useReaderStore((s) => s.docId);
  const sidebarOpen = useReaderStore((s) => s.sidebarOpen);
  const toggleSidebar = useReaderStore((s) => s.toggleSidebar);
  const chapterProgress = useSettingsStore((s) => s.chapterProgress);
  const section = useCurrentSection();
  const noteCount = useAnnotationCount();

  return (
    <header className="reader__toolbar" role="toolbar" aria-label="Reader">
      <div className="reader__toolbar-group reader__toolbar-group--start">
        <button
          type="button"
          className="btn btn--ghost btn--icon tooltip tooltip--below"
          data-tooltip="Library"
          aria-label="Back to library"
          onClick={() => navigate({ name: 'library' })}
        >
          <LibraryBig />
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon tooltip tooltip--below"
          data-tooltip={withShortcut('Sidebar', 'sidebar')}
          aria-label="Toggle sidebar"
          aria-keyshortcuts={ariaKeyShortcuts('sidebar')}
          aria-pressed={sidebarOpen}
          onClick={toggleSidebar}
        >
          <PanelLeft />
        </button>
        <HistoryButtons />
      </div>

      {/* The book's title doubles as the way into Go to (G): pages, contents, notes and text search. */}
      <div className="reader__heading">
        <Search className="reader__heading-icon" aria-hidden="true" />
        <h1 className="reader__title" title={doc?.title}>
          {doc?.title}
        </h1>
        {section && (
          <>
            <span className="reader__section-dot" aria-hidden="true">
              ·
            </span>
            <span className="reader__section">{section}</span>
          </>
        )}
        {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: <kbd> is not focusable; the button carries aria-keyshortcuts */}
        <kbd className="kbd reader__heading-key" aria-hidden="true">
          {keyLabel('go-to')}
        </kbd>
        <button
          type="button"
          className="reader__go-to"
          aria-label={section ? `${section}. Go to a page, chapter or note` : 'Go to a page, chapter or note'}
          aria-keyshortcuts={ariaKeyShortcuts('go-to')}
          onClick={() => openGoTo()}
        />
      </div>

      <div className="reader__toolbar-group reader__toolbar-group--end">
        <PageIndicator />
        <AppearanceMenu />
        <button
          type="button"
          className="btn btn--sm reader__review-btn tooltip tooltip--below"
          data-tooltip={withShortcut('Review all notes', 'review')}
          aria-label={`Review notes (${noteCount})`}
          aria-keyshortcuts={ariaKeyShortcuts('review')}
          onClick={() => docId && navigate({ name: 'review', docId })}
        >
          <NotebookText />
          <span>Review notes</span>
          {noteCount > 0 && <span className="reader__count">{noteCount}</span>}
        </button>
      </div>
      {chapterProgress && <ChapterProgress />}
    </header>
  );
}

/** Title of the outline section containing the current page, if any. */
function useCurrentSection(): string | null {
  const page = useReaderStore((s) => s.location.page);
  const outline = useReaderStore((s) => s.outline);
  return useMemo(() => sectionForPage(outline, page), [outline, page]);
}

/** Notes plus highlights that have no note of their own: everything the review lists. */
function useAnnotationCount(): number {
  const notes = useNotesStore((s) => s.notes);
  const highlights = useHighlightsStore((s) => s.highlights);
  return useMemo(() => {
    const linked = new Set(notes.map((n) => n.highlightId).filter(Boolean));
    return notes.length + highlights.filter((h) => !linked.has(h.id)).length;
  }, [notes, highlights]);
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'contents', label: 'Contents' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'notes', label: 'Notes' },
];

function ReaderSidebar() {
  const tab = useReaderStore((s) => s.sidebarTab);
  const setTab = useReaderStore((s) => s.setSidebarTab);
  useOverlayDismiss();
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const index = TABS.findIndex((t) => t.id === tab);
      const next = TABS[(index + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      setTab(next.id);
      document.getElementById(`sidebar-tab-${next.id}`)?.focus();
    },
    [tab, setTab],
  );

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar__tabs segmented segmented--full" role="tablist" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            id={`sidebar-tab-${t.id}`}
            role="tab"
            className="segmented__item"
            aria-selected={tab === t.id}
            aria-controls="sidebar-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        className="sidebar__panel"
        id="sidebar-panel"
        role="tabpanel"
        aria-labelledby={`sidebar-tab-${tab}`}
      >
        {tab === 'contents' && <OutlinePanel />}
        {tab === 'bookmarks' && <BookmarksPanel />}
        {tab === 'notes' && <NotesPanel />}
      </div>
    </aside>
  );
}

/**
 * A sidebar lying over the pages (tablets, phones) gets out of the way once the reader has
 * gone somewhere, clicks or taps the page, or narrows the window under it; beside the pages
 * it stays put. Its panels also close it after a jump to where the reader already is.
 */
function useOverlayDismiss() {
  useEffect(() => {
    const unsubscribe = useHistoryStore.subscribe((state, prev) => {
      if (state.back !== prev.back || state.forward !== prev.forward) closeSidebarIfOverlay();
    });
    // A click, not a pointerdown: scrolling the visible strip of page leaves the sidebar open.
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('.reader__main')) closeSidebarIfOverlay();
    };
    const overlay = window.matchMedia?.(SIDEBAR_OVERLAY_QUERY);
    overlay?.addEventListener('change', closeSidebarIfOverlay);
    document.addEventListener('click', onClick, true);
    return () => {
      unsubscribe();
      overlay?.removeEventListener('change', closeSidebarIfOverlay);
      document.removeEventListener('click', onClick, true);
    };
  }, []);
}
