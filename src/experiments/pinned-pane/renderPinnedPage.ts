import { pageCanvasContext } from '@/lib/pdf/canvas';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';

const MAX_PIXELS = 8_000_000;
const CACHE_SIZE = 6;

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  /** Page height ÷ width. */
  aspect: number;
}

const caches = new WeakMap<PDFDocumentProxy, Map<string, RenderedPage>>();

function cacheKey(page: number, width: number): string {
  return `${page}:${width}@${window.devicePixelRatio || 1}`;
}

export function cachedRender(pdf: PDFDocumentProxy, page: number, width: number): RenderedPage | null {
  const cache = caches.get(pdf);
  const key = cacheKey(page, width);
  const entry = cache?.get(key);
  if (!cache || !entry) return null;
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function remember(pdf: PDFDocumentProxy, page: number, width: number, rendered: RenderedPage): void {
  let cache = caches.get(pdf);
  if (!cache) {
    cache = new Map();
    caches.set(pdf, cache);
  }
  const key = cacheKey(page, width);
  cache.delete(key);
  cache.set(key, rendered);
  for (const [oldKey, old] of cache) {
    if (cache.size <= CACHE_SIZE) break;
    cache.delete(oldKey);
    if (!old.canvas.isConnected) {
      old.canvas.width = 0;
      old.canvas.height = 0;
    }
  }
}

/** Page height ÷ width, available before the bitmap is. */
export async function pageAspect(pdf: PDFDocumentProxy, pageNumber: number): Promise<number> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  return base.height / base.width;
}

/**
 * Draws a whole page at `width` CSS px (times the device pixel ratio). Aborting
 * cancels the pdf.js render task, so stale renders stop costing anything.
 */
export async function renderPinnedPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  width: number,
  signal: AbortSignal,
): Promise<RenderedPage> {
  const page = await pdf.getPage(pageNumber);
  signal.throwIfAborted();
  const base = page.getViewport({ scale: 1 });
  const aspect = base.height / base.width;
  const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (width * width * aspect)));
  const canvas = document.createElement('canvas');
  canvas.className = 'pinned-pane__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = Math.max(1, Math.floor(width * ratio));
  canvas.height = Math.max(1, Math.floor(width * aspect * ratio));
  const viewport = page.getViewport({ scale: canvas.width / base.width });
  const task = page.render({
    canvas: null,
    canvasContext: pageCanvasContext(canvas),
    viewport,
    transform: [1, 0, 0, canvas.height / viewport.height, 0, 0],
  });
  const cancel = () => task.cancel();
  signal.addEventListener('abort', cancel);
  try {
    await task.promise;
  } catch (error) {
    canvas.width = 0;
    canvas.height = 0;
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
  const rendered = { canvas, aspect };
  remember(pdf, pageNumber, width, rendered);
  return rendered;
}
