import { destroyPdf, fingerprintOf, loadPdf, readTitle } from '@/lib/pdf/pdfjs';
import { renderThumbnailDataUrl } from '@/lib/pdf/thumbnail';
import { getDocument, putDocument } from '@/lib/storage/repository';
import type { LibraryDocument } from '@/lib/types';

const INVALID_PDF =
  'That file couldn’t be opened. Check that it’s a valid PDF and try again. Nothing was added.';
const STORAGE_ERROR = 'Not enough storage space to add this book. Free up space and try again.';

export async function importPdfFile(file: File): Promise<{ doc: LibraryDocument; isNew: boolean }> {
  let pdf: Awaited<ReturnType<typeof loadPdf>> | undefined;
  try {
    try {
      const bytes = await file.arrayBuffer();
      pdf = await loadPdf(bytes.slice(0));
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'PasswordException'
      ) {
        throw new Error('Password-protected PDFs aren’t supported yet.', { cause: error });
      }
      throw new Error(INVALID_PDF, { cause: error });
    }

    const id = fingerprintOf(pdf);
    let existing: LibraryDocument | undefined;
    try {
      existing = await getDocument(id);
    } catch {
      throw new Error(STORAGE_ERROR);
    }
    const now = Date.now();
    let doc: LibraryDocument;
    if (existing) {
      doc = { ...existing, lastOpenedAt: now };
    } else {
      try {
        doc = {
          id,
          title: await readTitle(pdf, file.name),
          fileName: file.name,
          fileSize: file.size,
          pageCount: pdf.numPages,
          coverDataUrl: await renderThumbnailDataUrl(pdf, 1, 240),
          addedAt: now,
          lastOpenedAt: now,
        };
      } catch {
        throw new Error(INVALID_PDF);
      }
    }
    try {
      await putDocument(doc, file);
    } catch {
      throw new Error(STORAGE_ERROR);
    }
    return { doc, isNew: !existing };
  } finally {
    if (pdf) destroyPdf(pdf);
  }
}
