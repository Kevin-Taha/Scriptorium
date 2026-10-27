import { useCallback, useMemo } from 'react';
import { LibraryBig, NotebookText, PanelLeft } from 'lucide-react';
import { AppearanceMenu } from '@/app/AppearanceMenu';
import { navigate } from '@/app/router';
import { usePagesInverted } from '@/app/settingsStore';
import { sectionForPage } from '@/lib/pdf/outline';
import { BookmarkRibbon } from '../navigation/BookmarkRibbon';
import { BookmarksPanel } from '../navigation/BookmarksPanel';
import { BookmarkToggle } from '../navigation/BookmarkToggle';
import { HistoryButtons } from '../navigation/HistoryButtons';
import { useHistoryStore } from '../navigation/historyStore';
import { OutlinePanel } from '../navigation/OutlinePanel';
import { PageIndicator } from '../navigation/PageIndicator';
import { ReturnPill } from '../navigation/ReturnPill';
import { useKeyboardShortcuts } from '../navigation/useKeyboardShortcuts';
import { MarginColumn } from '../notes/MarginColumn';
import { NotesPanel } from '../notes/NotesPanel';
import { useNotesStore } from '../notes/notesStore';
import { PageNoteMarkers } from '../notes/PageNoteMarkers';
import { SelectionNotePopover } from '../notes/SelectionNotePopover';
import { useReaderStore, type SidebarTab } from './readerStore';
import { Viewer, type PageSize } from './Viewer';
import { ZoomControls } from './ZoomControls';
import './reader.css';

const renderMargin = (page: number, size: PageSize) => <MarginColumn page={page} size={size} />;
const renderPageOverlay = (page: number, size: PageSize) => (
  <>
    <PageNoteMarkers page={page} size={size} />
    <BookmarkRibbon page={page} />
  </>
);

export function ReaderView() {
  const pdf = useReaderStore((s) => s.pdf)!;
  const sidebarOpen = useReaderStore((s) => s.sidebarOpen);
  const jumpTo = useHistoryStore((s) => s.jumpTo);
  const inverted = usePagesInverted();
  useKeyboardShortcuts();

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
          <ReturnPill />
          <SelectionNotePopover />
        </main>
      </div>
    </div>
  );
}

function ReaderToolbar() {
  const doc = useReaderStore((s) => s.doc);
  const docId = useReaderStore((s) => s.docId);
  const sidebarOpen = useReaderStore((s) => s.sidebarOpen);
  const toggleSidebar = useReaderStore((s) => s.toggleSidebar);
  const section = useCurrentSection();
  const noteCount = useNotesStore((s) => s.notes.length);

  return (
    <header className="reader__toolbar" role="toolbar" aria-label="Reader">
      <div className="reader__toolbar-group reader__toolbar-group--start">
        <button
          className="btn btn--ghost btn--icon tooltip tooltip--below"
          data-tooltip="Library"
          aria-label="Back to library"
          onClick={() => navigate({ name: 'library' })}
        >
          <LibraryBig />
        </button>
        <button
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
            <span className="reader__section" title={section}>
              {section}
            </span>
          )}
        </div>
      </div>

      <div className="reader__toolbar-group reader__toolbar-group--end">
        <PageIndicator />
        <span className="divider divider--vertical" aria-hidden="true" />
        <ZoomControls />
        <span className="divider divider--vertical" aria-hidden="true" />
        <BookmarkToggle />
        <AppearanceMenu />
        <button
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
    </header>
  );
}

/** Title of the outline section containing the current page, if any. */
function useCurrentSection(): string | null {
  const page = useReaderStore((s) => s.location.page);
  const outline = useReaderStore((s) => s.outline);
  return useMemo(() => sectionForPage(outline, page), [outline, page]);
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'contents', label: 'Contents' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'notes', label: 'Notes' },
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
