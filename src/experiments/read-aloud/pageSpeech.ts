import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { getTextIndex } from '@/features/search/textIndex';
import {
  buildPageText,
  DEFAULT_BOX,
  type PageBox,
  type PageText,
  type TextItemLike,
} from '@/features/search/pageText';
import { buildPageSentences, type Sentence } from './sentences';

export interface PageSpeech {
  page: number;
  pageText: PageText;
  sentences: Sentence[];
}

const MAX_CACHED_PAGES = 12;
const cache = new Map<string, Promise<PageSpeech>>();

async function extractPageText(pdf: PDFDocumentProxy, number: number): Promise<PageText> {
  const page = await pdf.getPage(number);
  const content = await page.getTextContent();
  const items: TextItemLike[] = [];
  for (const item of content.items) if ('str' in item) items.push(item);
  const [x0, y0, x1, y1] = page.view;
  const box: PageBox = { view: [x0, y0, x1, y1], rotation: page.rotate };
  return buildPageText(number, items, box);
}

async function load(pdf: PDFDocumentProxy, docId: string, page: number): Promise<PageSpeech> {
  const index = getTextIndex(docId, pdf.numPages);
  let pageText = index.page(page);
  if (!pageText) {
    try {
      pageText = await extractPageText(pdf, page);
    } catch {
      pageText = buildPageText(page, [], DEFAULT_BOX);
    }
    // Shares the extraction with search; adding a page twice is ignored.
    index.add(pageText);
  }
  return { page, pageText, sentences: buildPageSentences(pageText) };
}

/** The readable sentences of a page, extracted on demand (and remembered for the next pass). */
export function loadPageSpeech(pdf: PDFDocumentProxy, docId: string, page: number): Promise<PageSpeech> {
  const key = `${docId}:${page}`;
  let entry = cache.get(key);
  if (entry) {
    cache.delete(key);
  } else {
    entry = load(pdf, docId, page);
    entry.catch(() => cache.delete(key));
  }
  cache.set(key, entry);
  for (const stale of cache.keys()) {
    if (cache.size <= MAX_CACHED_PAGES) break;
    cache.delete(stale);
  }
  return entry;
}

export function clearPageSpeech(): void {
  cache.clear();
}
