import { destroyPdf, loadPdf, readTitle } from '@/lib/pdf/pdfjs';
import { renderThumbnailDataUrl } from '@/lib/pdf/thumbnail';
import type { BookMetadata } from './engine';

/** Title, page count and cover of a folder book, read the same way imports read them. */
export async function extractBookMetadata(bytes: ArrayBuffer, fileName: string): Promise<BookMetadata> {
  const pdf = await loadPdf(bytes);
  try {
    let coverDataUrl: string | undefined;
    try {
      coverDataUrl = await renderThumbnailDataUrl(pdf, 1, 240);
    } catch (error) {
      console.warn(`Scriptorium: couldn’t draw a cover for “${fileName}”`, error);
    }
    return { title: await readTitle(pdf, fileName), pageCount: pdf.numPages, coverDataUrl };
  } finally {
    destroyPdf(pdf);
  }
}
