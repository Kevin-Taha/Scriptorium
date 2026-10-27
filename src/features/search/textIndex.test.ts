import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { clearTextIndexes, getTextIndex, TextIndex } from './textIndex';
import { makePage } from './testPages';

afterEach(() => clearTextIndexes());

interface FakeOptions {
  failing?: number[];
  withMarkedContent?: boolean;
  /** Time each page takes to load, so tests can interrupt extraction. */
  delayMs?: number;
}

/** A document whose pages hold the given lines of text; records the order pages are requested in. */
function fakePdf(
  pages: string[][],
  { failing = [], withMarkedContent = false, delayMs = 0 }: FakeOptions = {},
) {
  const requested: number[] = [];
  const pdf = {
    numPages: pages.length,
    loadingTask: { destroyed: false },
    getPage: vi.fn(async (number: number) => {
      requested.push(number);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (failing.includes(number)) throw new Error(`bad page ${number}`);
      return {
        view: [0, 0, 600, 800],
        rotate: 0,
        getTextContent: async () => ({
          items: [
            ...(withMarkedContent ? [{ type: 'beginMarkedContent', id: 'x' }] : []),
            ...pages[number - 1].map((str, i) => ({
              str,
              transform: [10, 0, 0, 10, 72, 700 - i * 14],
              width: str.length * 5,
              height: 10,
              hasEOL: true,
            })),
          ],
        }),
      };
    }),
  };
  return { pdf: pdf as unknown as PDFDocumentProxy, requested };
}

async function finished(index: TextIndex) {
  await vi.waitFor(() => expect(index.complete).toBe(true));
}

describe('TextIndex', () => {
  it('extracts every page and announces each one', async () => {
    const { pdf } = fakePdf([['alpha'], ['beta'], ['gamma']]);
    const index = new TextIndex('doc', 3);
    const announced: number[] = [];
    index.subscribe((page) => announced.push(page.page));
    index.start(pdf);
    await finished(index);

    expect(announced.sort()).toEqual([1, 2, 3]);
    expect(index.indexed).toBe(3);
    expect(index.page(2)?.text).toBe('beta');
    expect(index.indexedPages().map((p) => p.page)).toEqual([1, 2, 3]);
    expect(index.hasText).toBe(true);
    await vi.waitFor(() => expect(index.running).toBe(false));
  });

  it('starts near the reader and wraps around', async () => {
    const { pdf, requested } = fakePdf([['a'], ['b'], ['c'], ['d'], ['e']]);
    const index = new TextIndex('doc', 5);
    index.start(pdf, 4);
    await finished(index);
    expect(requested).toEqual([4, 5, 1, 2, 3]);
  });

  it('skips marked-content entries and indexes pages that fail as empty', async () => {
    const { pdf } = fakePdf([['one'], ['two'], ['three']], { failing: [2], withMarkedContent: true });
    const index = new TextIndex('doc', 3);
    index.start(pdf);
    await finished(index);
    expect(index.page(1)?.text).toBe('one');
    expect(index.page(2)?.text).toBe('');
    expect(index.page(3)?.text).toBe('three');
  });

  it('can be cancelled and then resumed where it left off', async () => {
    const pages = Array.from({ length: 12 }, (_, i) => [`page ${i + 1}`]);
    const { pdf, requested } = fakePdf(pages, { delayMs: 40 });
    const index = new TextIndex('doc', 12);
    index.start(pdf);
    // Poll faster than a page takes to index so cancellation always lands mid-run.
    await vi.waitFor(() => expect(index.indexed).toBeGreaterThan(1), { interval: 2, timeout: 5000 });
    index.cancel();
    expect(index.running).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const stopped = index.indexed;
    expect(stopped).toBeLessThan(12);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(index.indexed).toBe(stopped);

    requested.length = 0;
    index.start(pdf);
    await finished(index);
    expect(requested).not.toContain(1);
    expect(index.indexedPages()).toHaveLength(12);
  });

  it('does nothing when started while running or after completing', async () => {
    const { pdf } = fakePdf([['a'], ['b']]);
    const index = new TextIndex('doc', 2);
    index.start(pdf);
    index.start(pdf);
    await finished(index);
    await vi.waitFor(() => expect(index.running).toBe(false));
    const getPage = vi.mocked(pdf.getPage);
    const calls = getPage.mock.calls.length;
    index.start(pdf);
    expect(getPage.mock.calls.length).toBe(calls);
  });

  it('ignores a page added twice and reports books without text', () => {
    const index = new TextIndex('doc', 2);
    const listener = vi.fn();
    index.subscribe(listener);
    index.add(makePage(1, ''));
    index.add(makePage(1, 'late'));
    index.add(makePage(2, ''));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(index.complete).toBe(true);
    expect(index.hasText).toBe(false);
  });

  it('stops notifying unsubscribed listeners', () => {
    const index = new TextIndex('doc', 2);
    const listener = vi.fn();
    const unsubscribe = index.subscribe(listener);
    index.add(makePage(1, 'a'));
    unsubscribe();
    index.add(makePage(2, 'b'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('getTextIndex', () => {
  it('returns the same index for a document and keeps only the most recent few', () => {
    const first = getTextIndex('a', 3);
    expect(getTextIndex('a', 3)).toBe(first);
    getTextIndex('b', 3);
    getTextIndex('c', 3);
    getTextIndex('d', 3);
    expect(getTextIndex('a', 3)).not.toBe(first);
  });

  it('starts afresh when the page count changes', () => {
    const first = getTextIndex('a', 3);
    expect(getTextIndex('a', 4)).not.toBe(first);
  });
});
