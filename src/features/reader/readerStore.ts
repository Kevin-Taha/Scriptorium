import { create } from 'zustand';
import { reportSaveError } from '@/app/reportSaveError';
import { loadOutline } from '@/lib/pdf/outline';
import { destroyPdf, loadPdf, type PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { getDocument, getReadingState, putReadingState, updateDocument } from '@/lib/storage/repository';
import { onBookDataMerged } from '@/lib/sync/apply';
import { nextStamp } from '@/lib/sync/clock';
import { currentDeviceId } from '@/lib/sync/device';
import type { DocId, LibraryDocument, OutlineItem, ReadingLocation, ZoomState } from '@/lib/types';
import { debounce } from '@/lib/util';
import { contentsFromOutline, sameContents } from '../library/bookProgress';
import { readBookBytes } from '../sync/bookBytes';

export type SidebarTab = 'contents' | 'bookmarks' | 'notes';
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Imperative handle the viewer registers while it is mounted. */
export interface ViewerController {
  /** Scrolls so `location` sits at the top of the viewport. */
  scrollTo(location: ReadingLocation, options?: { smooth?: boolean }): void;
  /** The location currently at the top of the viewport. */
  getLocation(): ReadingLocation;
  /** The location at the vertical centre of the viewport (e.g. where `N` adds a note). */
  getVisibleCenter(): ReadingLocation;
  /** Rendered size of a page in CSS px at the current zoom. */
  getPageSize(page: number): { width: number; height: number } | null;
}

export const DEFAULT_ZOOM: ZoomState = { mode: 'fit-width', scale: 1 };
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 4;

interface ReaderState {
  docId: DocId | null;
  doc: LibraryDocument | null;
  pdf: PDFDocumentProxy | null;
  status: LoadStatus;
  error: string | null;
  outline: OutlineItem[];
  /** Printed page labels (e.g. "xii", "142") indexed by page - 1, or null when the PDF defines none. */
  pageLabels: string[] | null;
  /**
   * Current top-of-viewport location. The viewer reports it while scrolling and
   * restores it when it mounts, so it doubles as the "restore here" location.
   */
  location: ReadingLocation;
  zoom: ZoomState;
  controller: ViewerController | null;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;

  openDocument(docId: DocId): Promise<void>;
  closeDocument(): void;
  setLocation(location: ReadingLocation): void;
  setZoom(zoom: ZoomState): void;
  setController(controller: ViewerController | null): void;
  setSidebarOpen(open: boolean): void;
  toggleSidebar(): void;
  setSidebarTab(tab: SidebarTab): void;
}

const START: ReadingLocation = { page: 1, offset: 0 };
let openToken = 0;

export const useReaderStore = create<ReaderState>()((set, get) => ({
  docId: null,
  doc: null,
  pdf: null,
  status: 'idle',
  error: null,
  outline: [],
  pageLabels: null,
  location: START,
  zoom: DEFAULT_ZOOM,
  controller: null,
  sidebarOpen: true,
  sidebarTab: 'contents',

  async openDocument(docId) {
    if (get().docId === docId && get().status !== 'error') return;
    get().closeDocument();
    const token = ++openToken;
    set({ docId, status: 'loading', error: null });
    try {
      const [doc, saved] = await Promise.all([getDocument(docId), getReadingState(docId)]);
      if (!doc) throw new Error('This book is no longer in your library.');
      const bytes = await readBookBytes(doc);
      if (token !== openToken) return;
      const pdf = await loadPdf(bytes);
      if (token !== openToken) {
        destroyPdf(pdf);
        return;
      }
      const [outline, pageLabels] = await Promise.all([
        loadOutline(pdf).catch(() => []),
        pdf.getPageLabels().catch(() => null),
      ]);
      if (token !== openToken) {
        destroyPdf(pdf);
        return;
      }
      const lastOpenedAt = Date.now();
      const contents = contentsFromOutline(outline);
      // Saved once per book, so the library can name the chapter without opening the PDF.
      const patch = sameContents(doc.contents, contents) ? { lastOpenedAt } : { lastOpenedAt, contents };
      progressStamp = saved?.updatedAt ?? 0;
      set({
        doc: { ...doc, ...patch },
        pdf,
        outline,
        pageLabels,
        status: 'ready',
        location: saved?.location ?? START,
        zoom: saved?.zoom ?? DEFAULT_ZOOM,
      });
      void updateDocument(docId, patch);
    } catch (err) {
      if (token !== openToken) return;
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  closeDocument() {
    flushProgress();
    openToken++;
    const { pdf } = get();
    if (pdf) destroyPdf(pdf);
    set({
      docId: null,
      doc: null,
      pdf: null,
      status: 'idle',
      error: null,
      outline: [],
      pageLabels: null,
      location: START,
      zoom: DEFAULT_ZOOM,
      controller: null,
    });
  },

  setLocation(location) {
    const prev = get().location;
    if (prev.page === location.page && Math.abs(prev.offset - location.offset) < 0.0005) return;
    set({ location });
  },
  setZoom(zoom) {
    const prev = get().zoom;
    if (prev.mode === zoom.mode && Math.abs(prev.scale - zoom.scale) < 0.0005) return;
    set({ zoom });
  },
  setController: (controller) => set({ controller }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarTab: (sidebarTab) => set({ sidebarTab, sidebarOpen: true }),
}));

// ------------------------------------------------------ progress persistence

/** Newest progress stamp known for the open book, from this or any synced device. */
let progressStamp = 0;

const saveProgress = debounce(() => {
  const { docId, status, location, zoom } = useReaderStore.getState();
  if (!docId || status !== 'ready') return;
  progressStamp = nextStamp(progressStamp);
  putReadingState({ docId, location, zoom, updatedAt: progressStamp, deviceId: currentDeviceId() }).catch(
    reportSaveError,
  );
}, 400);

onBookDataMerged((docId, data) => {
  if (docId === useReaderStore.getState().docId && data.progress) {
    progressStamp = Math.max(progressStamp, data.progress.updatedAt);
  }
});

/** Writes any pending reading-progress change immediately. */
export function flushProgress(): void {
  saveProgress.flush();
}

useReaderStore.subscribe((state, prev) => {
  if (state.status !== 'ready' || state.docId !== prev.docId) return;
  if (state.location !== prev.location || state.zoom !== prev.zoom) saveProgress();
});

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushProgress();
  });
  window.addEventListener('pagehide', flushProgress);
}
