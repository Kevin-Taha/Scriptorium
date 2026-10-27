import { create } from 'zustand';
import { loadOutline } from '@/lib/pdf/outline';
import { destroyPdf, loadPdf, type PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import {
  getDocument,
  getDocumentFile,
  getReadingState,
  putReadingState,
  updateDocument,
} from '@/lib/storage/repository';
import type { DocId, LibraryDocument, OutlineItem, ReadingLocation, ZoomState } from '@/lib/types';
import { debounce } from '@/lib/util';

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
      const [doc, file, saved] = await Promise.all([
        getDocument(docId),
        getDocumentFile(docId),
        getReadingState(docId),
      ]);
      if (!doc || !file) throw new Error('This book is no longer in your library.');
      const pdf = await loadPdf(await file.arrayBuffer());
      if (token !== openToken) {
        destroyPdf(pdf);
        return;
      }
      const outline = await loadOutline(pdf).catch(() => []);
      if (token !== openToken) return;
      const lastOpenedAt = Date.now();
      set({
        doc: { ...doc, lastOpenedAt },
        pdf,
        outline,
        status: 'ready',
        location: saved?.location ?? START,
        zoom: saved?.zoom ?? DEFAULT_ZOOM,
      });
      void updateDocument(docId, { lastOpenedAt });
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

const saveProgress = debounce(() => {
  const { docId, status, location, zoom } = useReaderStore.getState();
  if (!docId || status !== 'ready') return;
  void putReadingState({ docId, location, zoom, updatedAt: Date.now() });
}, 400);

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
