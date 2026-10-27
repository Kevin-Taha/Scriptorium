import type { DocId } from '@/lib/types';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { renderPageToCanvas } from '@/lib/pdf/thumbnail';

export const THUMBNAIL_WIDTH = 160;

/** Used to size placeholders until a page's real proportions are known (US Letter). */
const FALLBACK_ASPECT = 8.5 / 11;
const MAX_CACHED = 500;
const MAX_CONCURRENT_RENDERS = 2;

export interface PageThumbnail {
  url: string;
  /** Width divided by height. */
  aspect: number;
}

export interface ThumbnailRequest {
  promise: Promise<PageThumbnail>;
  /** Drops interest in the thumbnail; a render that has not started yet is abandoned. */
  cancel(): void;
}

interface Job {
  key: string;
  refs: number;
  started: boolean;
  promise: Promise<PageThumbnail>;
  start(): void;
  abandon(): void;
}

const cache = new Map<string, PageThumbnail>();
const lastAspect = new Map<DocId, number>();
const jobs = new Map<string, Job>();
const queue: Job[] = [];
let running = 0;

const keyOf = (docId: DocId, page: number) => `${docId}:${page}`;

/** Thumbnail already rendered for this page, if any (most recently used entries are kept). */
export function peekThumbnail(docId: DocId, page: number): PageThumbnail | undefined {
  const key = keyOf(docId, page);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

/** Best guess at a page's width/height ratio for placeholder sizing. */
export function estimateAspect(docId: DocId, page: number): number {
  return cache.get(keyOf(docId, page))?.aspect ?? lastAspect.get(docId) ?? FALLBACK_ASPECT;
}

function remember(docId: DocId, key: string, thumbnail: PageThumbnail): void {
  cache.set(key, thumbnail);
  lastAspect.set(docId, thumbnail.aspect);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
}

function pump(): void {
  while (running < MAX_CONCURRENT_RENDERS && queue.length > 0) queue.shift()!.start();
}

function createJob(pdf: PDFDocumentProxy, docId: DocId, page: number): Job {
  const key = keyOf(docId, page);
  let resolve!: (thumbnail: PageThumbnail) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<PageThumbnail>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {}); // callers handle failures; this only prevents unhandled-rejection noise

  const job: Job = {
    key,
    refs: 0,
    started: false,
    promise,
    start() {
      job.started = true;
      running += 1;
      void (async () => {
        try {
          const canvas = await renderPageToCanvas(pdf, page, THUMBNAIL_WIDTH);
          const thumbnail = {
            url: canvas.toDataURL('image/jpeg', 0.85),
            aspect: canvas.width / canvas.height,
          };
          canvas.width = canvas.height = 0; // release the bitmap; the data URL is what we keep
          remember(docId, key, thumbnail);
          resolve(thumbnail);
        } catch (error) {
          reject(error);
        } finally {
          running -= 1;
          jobs.delete(key);
          pump();
        }
      })();
    },
    abandon() {
      const index = queue.indexOf(job);
      if (index !== -1) queue.splice(index, 1);
      jobs.delete(key);
      reject(new DOMException('Thumbnail request cancelled', 'AbortError'));
    },
  };
  return job;
}

/**
 * Renders (or fetches from cache) a page thumbnail. Renders run a couple at a
 * time, so scrolling past hundreds of rows never floods pdf.js.
 */
export function requestThumbnail(pdf: PDFDocumentProxy, docId: DocId, page: number): ThumbnailRequest {
  const key = keyOf(docId, page);
  const cached = peekThumbnail(docId, page);
  if (cached) return { promise: Promise.resolve(cached), cancel() {} };

  let job = jobs.get(key);
  if (!job) {
    job = createJob(pdf, docId, page);
    jobs.set(key, job);
    queue.push(job);
  }
  job.refs += 1;
  pump();

  const owner = job;
  let released = false;
  return {
    promise: owner.promise,
    cancel() {
      if (released) return;
      released = true;
      owner.refs -= 1;
      if (owner.refs === 0 && !owner.started) owner.abandon();
    },
  };
}
