import { useCallback, useMemo } from 'react';
import { Keyboard, LibraryBig, NotebookText, PanelLeft, Search as SearchIcon } from 'lucide-react';
import { AppearanceMenu } from '@/app/AppearanceMenu';
import { navigate } from '@/app/router';
import { usePagesInverted, useSettingsStore } from '@/app/settingsStore';
import { sectionForPage } from '@/lib/pdf/outline';
import { BookMap } from '../bookmap/BookMap';
import { FocusMode } from '../focus/FocusMode';
import { FocusModeButton } from '../focus/FocusModeButton';
import { ReadingRuler } from '../focus/ReadingRuler';
import { BookmarkRibbon } from '../navigation/BookmarkRibbon';
import { BookmarksPanel } from '../navigation/BookmarksPanel';
import { BookmarkToggle } from '../navigation/BookmarkToggle';
import { ChapterProgress } from '../navigation/ChapterProgress';
import { HistoryButtons } from '../navigation/HistoryButtons';
import { useHistoryStore } from '../navigation/historyStore';
import { OutlinePanel } from '../navigation/OutlinePanel';
import { PageIndicator } from '../navigation/PageIndicator';
import { ReturnPill } from '../navigation/ReturnPill';
import { openShortcutsDialog, ShortcutsDialog } from '../navigation/ShortcutsDialog';
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
import { SearchPanel } from '../search/SearchPanel';
import { useSearchShortcut } from '../search/useSearchShortcut';
import { useReaderStore, type SidebarTab } from './readerStore';
import { Viewer, type PageSize } from './Viewer';
import { ZoomControls } from './ZoomControls';
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
        </main>
      </div>
      <FocusMode />
      <GoToPalette />
      <ShortcutsDialog />
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
          data-tooltip="Sidebar ( [ )"
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
          onClick={toggleSidebar}
        >
          <PanelLeft />
        </button>
        <span className="divider divider--vertical" aria-hidden="true" />
        <HistoryButtons />
        <div className="reader__heading">
          <h1 className="reader__title" title={doc?.title}>
            {doc?.title}
          </h1>
          {section && (
            <>
              <span className="reader__section-dot" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className="reader__section tooltip tooltip--below"
                data-tooltip="Go to… (G)"
                aria-label={`${section}. Go to a page, chapter or note`}
                aria-keyshortcuts="G"
                onClick={() => openGoTo()}
              >
                <span>{section}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="reader__toolbar-group reader__toolbar-group--end">
        <PageIndicator />
        <span className="divider divider--vertical" aria-hidden="true" />
        <ZoomControls />
        <span className="divider divider--vertical" aria-hidden="true" />
        <BookmarkToggle />
        <FocusModeButton />
        <AppearanceMenu />
        <button
          type="button"
          className="btn btn--sm reader__review-btn tooltip tooltip--below"
          data-tooltip="Review all notes (Shift+R)"
          aria-label={`Review notes (${noteCount})`}
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

const TABS: { id: SidebarTab; label: string; Icon?: typeof SearchIcon }[] = [
  { id: 'contents', label: 'Contents' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'notes', label: 'Notes' },
  { id: 'search', label: 'Search', Icon: SearchIcon },
];

function ReaderSidebar() {
  const tab = useReaderStore((s) => s.sidebarTab);
  const setTab = useReaderStore((s) => s.setSidebarTab);
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
            className={`segmented__item${t.Icon ? ' sidebar__tab--icon' : ''}`}
            aria-selected={tab === t.id}
            aria-controls="sidebar-panel"
            aria-label={t.Icon ? `${t.label} (Ctrl+F)` : undefined}
            title={t.Icon ? `${t.label} (Ctrl+F)` : undefined}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.Icon ? <t.Icon aria-hidden="true" /> : t.label}
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
        {tab === 'search' && <SearchPanel />}
      </div>
      <div className="sidebar__footer">
        <button
          type="button"
          className="btn btn--ghost sidebar__shortcuts tooltip"
          data-tooltip="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
          onClick={openShortcutsDialog}
        >
          <Keyboard aria-hidden="true" />
          <span>Keyboard shortcuts</span>
          {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: <kbd> is not focusable; the hint is redundant for screen readers */}
          <kbd className="kbd" aria-hidden="true">
            ?
          </kbd>
        </button>
      </div>
    </aside>
  );
}
