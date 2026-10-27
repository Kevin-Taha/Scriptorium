import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/** Pixels per PDF point at 100% zoom (96 CSS px per inch / 72 pt per inch). */
export const PDF_TO_CSS_UNITS = 96 / 72;

function assetBase(): string {
  return new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
}

/**
 * Opens a PDF from raw bytes. The buffer is transferred to the worker, so pass
 * a fresh copy (e.g. `await blob.arrayBuffer()`) each time.
 */
export function loadPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const base = assetBase();
  return getDocument({
    data,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
  }).promise;
}

/** Releases the document and its worker-side resources. */
export function destroyPdf(pdf: PDFDocumentProxy): void {
  void pdf.loadingTask.destroy();
}

/** Best-effort human title: PDF metadata title, falling back to the file name. */
export async function readTitle(pdf: PDFDocumentProxy, fileName: string): Promise<string> {
  try {
    const { info } = await pdf.getMetadata();
    const title = (info as { Title?: unknown } | undefined)?.Title;
    if (typeof title === 'string' && title.trim().length > 1) return title.trim();
  } catch {
    // Metadata is optional; fall through to the file name.
  }
  return (
    fileName
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Untitled'
  );
}
