import type { PDFDocumentProxy, PDFPageProxy } from '@/lib/pdf/pdfjs';
import type { PageSizes } from './viewerLayout';

const BATCH_SIZE = 32;

/**
 * Unscaled page sizes for one document, learned progressively.
 *
 * The first snapshot only needs page 1 (plus the page being restored): every
 * unknown page assumes page 1's size. The rest are fetched in the background in
 * batches, nearest to the reader first, and pages fetched for rendering are
 * recorded as they arrive. Snapshots are immutable; a new one is published only
 * when a size actually differs, so uniform books never re-layout.
 */
export class PageSizeIndex {
  private readonly count: number;
  private readonly widths: Float64Array;
  private readonly heights: Float64Array;
  private readonly known: Uint8Array;
  private knownCount = 0;
  private snapshot: PageSizes | null = null;
  private dirty = false;
  private publishQueued = false;
  private readonly listeners = new Set<() => void>();
  private consumers = 0;
  private loading = false;

  constructor(private readonly pdf: PDFDocumentProxy) {
    this.count = pdf.numPages;
    this.widths = new Float64Array(this.count);
    this.heights = new Float64Array(this.count);
    this.known = new Uint8Array(this.count);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): PageSizes | null => this.snapshot;

  /** Records the size of a page fetched elsewhere (e.g. for rendering). */
  record(pageNumber: number, page: PDFPageProxy): void {
    const i = pageNumber - 1;
    if (i < 0 || i >= this.count || this.known[i]) return;
    const { width, height } = page.getViewport({ scale: 1 });
    this.known[i] = 1;
    this.knownCount++;
    if (this.widths[i] !== width || this.heights[i] !== height) {
      this.widths[i] = width;
      this.heights[i] = height;
      this.dirty = true;
      if (this.snapshot) this.queuePublish();
    }
  }

  /**
   * Loads sizes while at least one consumer is active, starting near
   * `focusPage()`. Returns a function that releases this consumer.
   */
  load(focusPage: () => number): () => void {
    this.consumers++;
    if (!this.loading) {
      this.loading = true;
      void this.run(focusPage).finally(() => {
        this.loading = false;
      });
    }
    return () => {
      this.consumers--;
    };
  }

  private async run(focusPage: () => number): Promise<void> {
    try {
      if (!this.snapshot) {
        const focus = this.clampPage(focusPage());
        const first = [1, focus - 1, focus, focus + 1].filter(
          (n, idx, all) => n >= 1 && n <= this.count && all.indexOf(n) === idx,
        );
        await this.fetch(first);
        // Until a page is fetched it borrows page 1's size (US Letter if page 1 is unreadable).
        const width = this.widths[0] || 612;
        const height = this.heights[0] || 792;
        for (let i = 0; i < this.count; i++) {
          if (this.widths[i] && this.heights[i]) continue;
          this.widths[i] = width;
          this.heights[i] = height;
        }
        this.publish();
      }
      while (this.consumers > 0 && this.knownCount < this.count) {
        await this.fetch(this.nextBatch(this.clampPage(focusPage())));
        if (this.dirty) this.publish();
        await idle();
      }
    } catch {
      // The document was closed (or a page is unreadable); keep the estimates.
    }
  }

  private async fetch(pageNumbers: number[]): Promise<void> {
    const pages = await Promise.all(pageNumbers.map((n) => this.pdf.getPage(n).catch(() => null)));
    pages.forEach((page, idx) => {
      if (page) this.record(pageNumbers[idx], page);
      else this.markUnreadable(pageNumbers[idx]);
    });
  }

  /** Unknown pages nearest to the focus page, alternating below and above it. */
  private nextBatch(focus: number): number[] {
    const batch: number[] = [];
    for (let d = 0; batch.length < BATCH_SIZE && (focus + d <= this.count || focus - d >= 1); d++) {
      const below = focus + d;
      const above = focus - d;
      if (below <= this.count && !this.known[below - 1]) batch.push(below);
      if (d > 0 && above >= 1 && !this.known[above - 1] && batch.length < BATCH_SIZE) batch.push(above);
    }
    return batch;
  }

  private markUnreadable(pageNumber: number): void {
    const i = pageNumber - 1;
    if (this.known[i]) return;
    this.known[i] = 1;
    this.knownCount++;
  }

  private clampPage(page: number): number {
    return Math.min(Math.max(1, Math.round(page) || 1), this.count);
  }

  private queuePublish(): void {
    if (this.publishQueued) return;
    this.publishQueued = true;
    setTimeout(() => {
      this.publishQueued = false;
      if (this.dirty) this.publish();
    }, 0);
  }

  private publish(): void {
    this.dirty = false;
    this.snapshot = { widths: this.widths.slice(), heights: this.heights.slice() };
    for (const listener of this.listeners) listener();
  }
}

const indexes = new WeakMap<PDFDocumentProxy, PageSizeIndex>();

/** The shared size index for a document (kept for the document's lifetime). */
export function pageSizeIndex(pdf: PDFDocumentProxy): PageSizeIndex {
  let index = indexes.get(pdf);
  if (!index) {
    index = new PageSizeIndex(pdf);
    indexes.set(pdf, index);
  }
  return index;
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 200 });
    else setTimeout(resolve, 16);
  });
}
