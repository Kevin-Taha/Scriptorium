import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { buildPageText, DEFAULT_BOX, type PageBox, type PageText, type TextItemLike } from './pageText';

/** Pages extracted at once: enough to keep the pdf.js worker busy without starving page rendering. */
const CONCURRENCY = 2;
/** Main-thread work allowed before handing control back, so scrolling and typing stay smooth. */
const SLICE_MS = 10;
/** Indexes kept in memory; the least recently used one is dropped (and stopped) beyond this. */
const MAX_CACHED_INDEXES = 3;

type PageListener = (page: PageText) => void;

interface Job {
  cancelled: boolean;
}

/** Lets the browser run pending input and rendering work. */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The searchable text of one document. Pages are extracted lazily in the
 * background (starting near where the reader is) and announced to subscribers
 * as they arrive; a finished index stays in memory for instant repeat searches.
 */
export class TextIndex {
  private readonly pages: (PageText | undefined)[];
  private count = 0;
  private withText = 0;
  private job: Job | null = null;
  private readonly listeners = new Set<PageListener>();

  constructor(
    readonly docId: string,
    readonly total: number,
  ) {
    this.pages = new Array<PageText | undefined>(total);
  }

  /** Number of pages extracted so far. */
  get indexed(): number {
    return this.count;
  }

  get complete(): boolean {
    return this.count >= this.total;
  }

  get running(): boolean {
    return this.job !== null;
  }

  /** Whether any extracted page has text at all (scanned books have none). */
  get hasText(): boolean {
    return this.withText > 0;
  }

  page(page: number): PageText | undefined {
    return this.pages[page - 1];
  }

  /** The pages extracted so far, in page order. */
  indexedPages(): PageText[] {
    return this.pages.filter((page): page is PageText => page !== undefined);
  }

  /** Records a page and tells subscribers; adding a page twice is ignored. */
  add(pageText: PageText): void {
    const slot = pageText.page - 1;
    if (slot < 0 || slot >= this.total || this.pages[slot]) return;
    this.pages[slot] = pageText;
    this.count++;
    if (pageText.text !== '') this.withText++;
    for (const listener of [...this.listeners]) listener(pageText);
  }

  /** Calls `listener` for each page extracted from now on. */
  subscribe(listener: PageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Starts (or resumes) background extraction, beginning at `firstPage` and
   * wrapping around. Does nothing when the index is complete or already running.
   */
  start(pdf: PDFDocumentProxy, firstPage = 1): void {
    if (this.complete || this.job) return;
    const job: Job = { cancelled: false };
    this.job = job;
    const begin = Math.min(Math.max(firstPage, 1), this.total);
    const order: number[] = [];
    for (let i = 0; i < this.total; i++) {
      const page = ((begin - 1 + i) % this.total) + 1;
      if (!this.pages[page - 1]) order.push(page);
    }
    void this.extract(pdf, job, order);
  }

  /** Stops background extraction; pages already indexed are kept and extraction can be resumed. */
  cancel(): void {
    if (this.job) this.job.cancelled = true;
    this.job = null;
  }

  private async extract(pdf: PDFDocumentProxy, job: Job, order: number[]): Promise<void> {
    let next = 0;
    const lane = async () => {
      let sliceStart = performance.now();
      while (!job.cancelled && next < order.length) {
        const page = order[next++];
        let pageText: PageText;
        try {
          pageText = await extractPage(pdf, page);
        } catch {
          if (job.cancelled || pdf.loadingTask.destroyed) return;
          pageText = buildPageText(page, [], DEFAULT_BOX);
        }
        if (job.cancelled) return;
        this.add(pageText);
        if (performance.now() - sliceStart > SLICE_MS) {
          await yieldToMain();
          sliceStart = performance.now();
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, lane));
    if (this.job === job) this.job = null;
  }
}

async function extractPage(pdf: PDFDocumentProxy, number: number): Promise<PageText> {
  const page = await pdf.getPage(number);
  const content = await page.getTextContent();
  const items: TextItemLike[] = [];
  for (const item of content.items) if ('str' in item) items.push(item);
  const [x0, y0, x1, y1] = page.view;
  const box: PageBox = { view: [x0, y0, x1, y1], rotation: page.rotate };
  return buildPageText(number, items, box);
}

// ------------------------------------------------------------------- cache

const indexes = new Map<string, TextIndex>();

/** The text index for a document, created on first use. */
export function getTextIndex(docId: string, total: number): TextIndex {
  let index = indexes.get(docId);
  if (index && index.total !== total) {
    index.cancel();
    index = undefined;
  }
  if (!index) index = new TextIndex(docId, total);
  indexes.delete(docId);
  indexes.set(docId, index);
  for (const [id, stale] of indexes) {
    if (indexes.size <= MAX_CACHED_INDEXES) break;
    stale.cancel();
    indexes.delete(id);
  }
  return index;
}

/** Stops background extraction for a document (its index is kept). */
export function pauseTextIndex(docId: string): void {
  indexes.get(docId)?.cancel();
}

/** Forgets every cached index. */
export function clearTextIndexes(): void {
  for (const index of indexes.values()) index.cancel();
  indexes.clear();
}
