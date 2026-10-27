import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pageCanvasContext } from './canvas';

/**
 * Renders a page to an offscreen canvas at the given CSS width.
 * Used for library covers and the collated notes review.
 */
export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  cssWidth: number,
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2),
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * pixelRatio });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas: null, canvasContext: pageCanvasContext(canvas), viewport }).promise;
  return canvas;
}

/** JPEG data URL of a page, sized for thumbnails. */
export async function renderThumbnailDataUrl(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  cssWidth = 240,
): Promise<string> {
  const canvas = await renderPageToCanvas(pdf, pageNumber, cssWidth, 1.5);
  return canvas.toDataURL('image/jpeg', 0.82);
}
