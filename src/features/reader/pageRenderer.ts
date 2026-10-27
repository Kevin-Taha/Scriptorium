import { TextLayer, type PageViewport, type RenderTask } from 'pdfjs-dist';
import { pageCanvasContext } from '@/lib/pdf/canvas';
import { resolveDestination } from '@/lib/pdf/outline';
import type { PDFDocumentProxy, PDFPageProxy } from '@/lib/pdf/pdfjs';
import type { ReadingLocation } from '@/lib/types';
import type { PageRange } from './viewerLayout';
import { registerTextLayer, unregisterTextLayer } from './textSelection';

/** Upper bound for a single canvas backing store (≈ 4096²), to bound memory at high zoom. */
const MAX_CANVAS_PIXELS = 16_777_216;
/** Parallel page jobs: enough to overlap worker parsing with main-thread painting. */
const MAX_CONCURRENT_JOBS = 2;
/** After a zoom change, stretched bitmaps are re-rendered once zooming pauses. */
const RERENDER_DELAY_MS = 150;
/** Landing on unrendered pages again this soon after the last time means a fast flick or scrollbar drag… */
const RAPID_JUMP_MS = 150;
/** …so rendering waits until the scroll pauses this long, instead of drawing pages that flash past. */
const SCROLL_SETTLE_MS = 100;

export interface PageElements {
  sheet: HTMLElement;
  textLayer: HTMLElement;
  links: HTMLElement;
}

interface Job {
  cancelled: boolean;
  renderTask: RenderTask | null;
}

interface PageSlot {
  page: number;
  els: PageElements;
  proxy: PDFPageProxy | null;
  canvas: HTMLCanvasElement | null;
  canvasScale: number;
  canvasPixelRatio: number;
  textLayer: TextLayer | null;
  textScale: number;
  textDone: boolean;
  linksDone: boolean;
  failed: boolean;
  job: Job | null;
}

interface LinkAnnotation {
  subtype?: string;
  rect?: number[];
  url?: string;
  dest?: string | unknown[] | null;
  action?: string;
}

/** Destination resolvers of the internal links currently on screen. */
const internalLinkTargets = new WeakMap<Element, () => Promise<ReadingLocation | null>>();

/** Destination of an internal link rendered by the viewer; null for any other element. */
export function internalLinkTarget(element: Element): Promise<ReadingLocation | null> | null {
  return internalLinkTargets.get(element)?.() ?? null;
}

/**
 * Renders page canvases, text layers and links for the pages the viewer asks
 * for, most important first. Lives outside React: page rows attach their DOM
 * elements, and the viewer updates the scale and the render window as the
 * reader scrolls. Pages leaving the window are cancelled and their canvases
 * released, so memory stays bounded however long the document is.
 */
export class PageRenderer {
  private readonly slots = new Map<number, PageSlot>();
  private order: number[] = [];
  private scale = 0;
  private settled = true;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private leadPage = 0;
  private lastBlankLanding = -Infinity;
  private running = 0;
  private onNavigate: ((target: ReadingLocation) => void) | null = null;

  constructor(
    private readonly pdf: PDFDocumentProxy,
    private readonly onPageLoaded?: (pageNumber: number, page: PDFPageProxy) => void,
  ) {}

  setLinkHandler(handler: ((target: ReadingLocation) => void) | null): void {
    this.onNavigate = handler;
  }

  attach(page: number, els: PageElements): void {
    this.detach(page);
    this.slots.set(page, {
      page,
      els,
      proxy: null,
      canvas: null,
      canvasScale: 0,
      canvasPixelRatio: 0,
      textLayer: null,
      textScale: 0,
      textDone: false,
      linksDone: false,
      failed: false,
      job: null,
    });
    this.pump();
  }

  detach(page: number): void {
    const slot = this.slots.get(page);
    if (!slot) return;
    this.release(slot);
    this.slots.delete(page);
  }

  /**
   * Sets the CSS scale pages are drawn at. Existing bitmaps stay up (stretched
   * by CSS) and are re-rendered crisply once the scale stops changing.
   */
  setScale(scale: number): void {
    if (scale === this.scale) return;
    const initial = this.scale === 0;
    this.scale = scale;
    for (const slot of this.slots.values()) this.cancelJob(slot);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    const hasBitmaps = [...this.slots.values()].some((slot) => slot.canvas);
    if (initial || !hasBitmaps) {
      this.settled = true;
      this.pump();
      return;
    }
    this.settled = false;
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.settled = true;
      this.pump();
    }, RERENDER_DELAY_MS);
  }

  /**
   * `order`: pages to render, in priority order. `keep`: pages allowed to keep
   * their rendered content (a slightly wider band, so small scrolls back and
   * forth don't re-render). Everything else is cancelled and released.
   */
  setWindow(order: number[], keep: PageRange): void {
    this.order = order;
    const wanted = new Set(order);
    for (const slot of this.slots.values()) {
      if (slot.page < keep.first || slot.page > keep.last) this.release(slot);
      else if (slot.job && !wanted.has(slot.page)) this.cancelJob(slot);
    }
    const lead = order[0] ?? 0;
    if (lead !== this.leadPage && !this.slots.get(lead)?.canvas) {
      const now = performance.now();
      const rapid = now - this.lastBlankLanding < RAPID_JUMP_MS;
      this.lastBlankLanding = now;
      if (rapid) {
        this.leadPage = lead;
        this.deferUntilScrollSettles();
        return;
      }
    }
    this.leadPage = lead;
    this.pump();
  }

  /** Cancels all work and releases every bitmap. The renderer stays usable. */
  dispose(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.scrollSettleTimer) clearTimeout(this.scrollSettleTimer);
    this.settleTimer = null;
    this.scrollSettleTimer = null;
    this.settled = true;
    for (const slot of this.slots.values()) this.release(slot);
    this.slots.clear();
    this.order = [];
    this.leadPage = 0;
  }

  private deferUntilScrollSettles(): void {
    if (this.scrollSettleTimer) clearTimeout(this.scrollSettleTimer);
    this.scrollSettleTimer = setTimeout(() => {
      this.scrollSettleTimer = null;
      this.pump();
    }, SCROLL_SETTLE_MS);
  }

  private pump(): void {
    if (!this.settled || this.scrollSettleTimer || this.scale === 0) return;
    for (const page of this.order) {
      if (this.running >= MAX_CONCURRENT_JOBS) return;
      const slot = this.slots.get(page);
      if (!slot || slot.job || slot.failed || !this.needsWork(slot)) continue;
      const job: Job = { cancelled: false, renderTask: null };
      slot.job = job;
      this.running++;
      void this.run(slot, job).finally(() => {
        this.running--;
        if (slot.job === job) slot.job = null;
        this.pump();
      });
    }
  }

  private needsWork(slot: PageSlot): boolean {
    return (
      !slot.canvas ||
      slot.canvasScale !== this.scale ||
      slot.canvasPixelRatio !== pixelRatio() ||
      !slot.textDone ||
      slot.textScale !== this.scale ||
      !slot.linksDone
    );
  }

  private async run(slot: PageSlot, job: Job): Promise<void> {
    try {
      const page = slot.proxy ?? (await this.pdf.getPage(slot.page));
      if (job.cancelled) return;
      slot.proxy = page;
      this.onPageLoaded?.(slot.page, page);
      if (!slot.canvas || slot.canvasScale !== this.scale || slot.canvasPixelRatio !== pixelRatio()) {
        await this.renderCanvas(slot, page, job);
        if (job.cancelled) return;
      }
      if (!slot.textLayer) await this.renderText(slot, page, job);
      else if (slot.textScale !== this.scale) {
        slot.textLayer.update({ viewport: page.getViewport({ scale: this.scale }) });
        slot.textScale = this.scale;
      }
      if (job.cancelled) return;
      if (!slot.linksDone) await this.renderLinks(slot, page, job);
    } catch (error) {
      if (job.cancelled || isCancellation(error)) return;
      slot.failed = true;
      console.error(`Could not render page ${slot.page}`, error);
    }
  }

  private async renderCanvas(slot: PageSlot, page: PDFPageProxy, job: Job): Promise<void> {
    const scale = this.scale;
    const dpr = pixelRatio();
    // Same arithmetic as the layout, so the bitmap maps exactly onto the sheet.
    const base = page.getViewport({ scale: 1 });
    const cssWidth = Math.max(1, Math.floor(base.width * scale));
    const cssHeight = Math.max(1, Math.floor(base.height * scale));
    const ratio = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight)));
    const viewport = page.getViewport({ scale: scale * ratio });
    const canvas = document.createElement('canvas');
    canvas.className = 'page-sheet__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.max(1, Math.floor(cssWidth * ratio));
    canvas.height = Math.max(1, Math.floor(cssHeight * ratio));
    const task = page.render({
      canvas: null,
      canvasContext: pageCanvasContext(canvas),
      viewport,
      transform: [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0],
    });
    job.renderTask = task;
    try {
      await task.promise;
    } catch (error) {
      releaseCanvas(canvas);
      throw error;
    } finally {
      job.renderTask = null;
    }
    if (job.cancelled || scale !== this.scale) {
      releaseCanvas(canvas);
      return;
    }
    const previous = slot.canvas;
    if (previous) {
      previous.replaceWith(canvas);
      releaseCanvas(previous);
    } else {
      canvas.classList.add('is-entering');
      slot.els.sheet.prepend(canvas);
    }
    slot.canvas = canvas;
    slot.canvasScale = scale;
    slot.canvasPixelRatio = dpr;
  }

  private async renderText(slot: PageSlot, page: PDFPageProxy, job: Job): Promise<void> {
    const container = slot.els.textLayer;
    container.replaceChildren();
    if (page.userUnit !== 1) container.style.setProperty('--user-unit', String(page.userUnit));
    const scale = this.scale;
    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport: page.getViewport({ scale }),
    });
    slot.textLayer = textLayer;
    try {
      await textLayer.render();
    } catch (error) {
      if (job.cancelled || isCancellation(error)) return;
      // Pages without extractable text simply have no selectable layer.
    }
    if (job.cancelled || slot.textLayer !== textLayer) return;
    const end = document.createElement('div');
    end.className = 'endOfContent';
    container.append(end);
    registerTextLayer(container, end);
    slot.textDone = true;
    slot.textScale = scale;
  }

  private async renderLinks(slot: PageSlot, page: PDFPageProxy, job: Job): Promise<void> {
    let annotations: LinkAnnotation[] = [];
    try {
      annotations = (await page.getAnnotations({ intent: 'display' })) as LinkAnnotation[];
    } catch {
      // Treat unreadable annotations as "no links".
    }
    if (job.cancelled) return;
    const viewport = page.getViewport({ scale: 1 });
    const fragment = document.createDocumentFragment();
    for (const annotation of annotations) {
      const link = this.createLink(annotation, viewport, slot.page);
      if (link) fragment.append(link);
    }
    slot.els.links.replaceChildren(fragment);
    slot.linksDone = true;
  }

  private createLink(
    annotation: LinkAnnotation,
    viewport: PageViewport,
    pageNumber: number,
  ): HTMLAnchorElement | null {
    if (annotation.subtype !== 'Link' || !annotation.rect) return null;
    const external = typeof annotation.url === 'string' && annotation.url ? annotation.url : null;
    const resolve = external ? null : this.internalTarget(annotation, pageNumber);
    if (!external && !resolve) return null;

    const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]) as number[];
    const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]) as number[];
    const link = document.createElement('a');
    link.className = 'page-sheet__link';
    Object.assign(link.style, {
      left: percent(Math.min(x1, x2) / viewport.width),
      top: percent(Math.min(y1, y2) / viewport.height),
      width: percent(Math.abs(x2 - x1) / viewport.width),
      height: percent(Math.abs(y2 - y1) / viewport.height),
    });

    if (external) {
      link.href = external;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = external;
      link.dataset.link = 'external';
      return link;
    }

    link.href = '#';
    link.dataset.link = 'internal';
    link.setAttribute('aria-label', 'Go to linked page');
    let target: Promise<ReadingLocation | null> | null = null;
    const resolveOnce = () => (target ??= resolve!());
    internalLinkTargets.set(link, resolveOnce);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      void resolveOnce().then((location) => {
        if (location) this.onNavigate?.(location);
      });
    });
    // Resolve eagerly (it's cheap) so the link can name its destination.
    void resolveOnce().then((location) => {
      if (location) link.setAttribute('aria-label', `Go to page ${location.page}`);
    });
    return link;
  }

  private internalTarget(
    annotation: LinkAnnotation,
    pageNumber: number,
  ): (() => Promise<ReadingLocation | null>) | null {
    if (annotation.dest) {
      const dest = annotation.dest;
      return () => resolveDestination(this.pdf, dest);
    }
    const numPages = this.pdf.numPages;
    const page = {
      FirstPage: 1,
      LastPage: numPages,
      NextPage: pageNumber + 1,
      PrevPage: pageNumber - 1,
    }[annotation.action ?? ''];
    if (page === undefined || page < 1 || page > numPages) return null;
    return () => Promise.resolve({ page, offset: 0 });
  }

  private cancelJob(slot: PageSlot): void {
    const job = slot.job;
    if (!job || job.cancelled) return;
    job.cancelled = true;
    job.renderTask?.cancel();
    if (slot.textLayer && !slot.textDone) {
      slot.textLayer.cancel();
      slot.textLayer = null;
      slot.els.textLayer.replaceChildren();
    }
  }

  private release(slot: PageSlot): void {
    this.cancelJob(slot);
    const hadContent = slot.canvas || slot.textLayer || slot.linksDone;
    if (slot.canvas) releaseCanvas(slot.canvas);
    slot.canvas = null;
    slot.canvasScale = 0;
    slot.canvasPixelRatio = 0;
    if (slot.textLayer) slot.textLayer.cancel();
    slot.textLayer = null;
    slot.textDone = false;
    slot.textScale = 0;
    unregisterTextLayer(slot.els.textLayer);
    slot.els.textLayer.replaceChildren();
    slot.els.links.replaceChildren();
    slot.linksDone = false;
    slot.failed = false;
    if (hadContent) slot.proxy?.cleanup();
    slot.proxy = null;
  }
}

function pixelRatio(): number {
  return window.devicePixelRatio || 1;
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`;
}

/** Shrinking the backing store frees its memory immediately (notably in Safari). */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}

function isCancellation(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  return name === 'RenderingCancelledException' || name === 'AbortException';
}
