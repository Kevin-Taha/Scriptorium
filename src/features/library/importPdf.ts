import { contentHash } from '@/lib/hash';
import { destroyPdf, loadPdf, readTitle } from '@/lib/pdf/pdfjs';
import { renderThumbnailDataUrl } from '@/lib/pdf/thumbnail';
import { getDocument, putDocument } from '@/lib/storage/repository';
import type { LibraryDocument } from '@/lib/types';

const INVALID_PDF =
  'That file couldn’t be opened. Check that it’s a valid PDF and try again. Nothing was added.';
const STORAGE_ERROR = 'Not enough storage space to add this book. Free up space and try again.';

/**
 * Adds a PDF to the library. Books are keyed by a hash of their bytes, so
 * re-importing the identical file reopens the existing book (keeping its notes
 * and progress, and refreshing its stored copy), while a revised edition
 * becomes a separate book.
 */
export async function importPdfFile(file: File): Promise<{ doc: LibraryDocument; isNew: boolean }> {
  const bytes = await file.arrayBuffer();
  const id = await contentHash(bytes);
  const now = Date.now();
  // Store our own in-memory copy: a picked File can remain tied to the original file on
  // disk, which would make the book unreadable if that file is later edited or moved.
  const storedCopy = () => new Blob([bytes], { type: 'application/pdf' });

  let existing: LibraryDocument | undefined;
  try {
    existing = await getDocument(id);
    if (existing) {
      // Importing a book that came from the linked folder gives it its own copy here, so it
      // stays readable if the file leaves the folder or the folder can't be reached.
      existing = { ...existing, lastOpenedAt: now, source: { kind: 'imported' } };
      await putDocument(existing, storedCopy());
    }
  } catch {
    throw new Error(STORAGE_ERROR);
  }
  if (existing) return { doc: existing, isNew: false };

  let pdf: Awaited<ReturnType<typeof loadPdf>> | undefined;
  try {
    try {
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

    let doc: LibraryDocument;
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
    try {
      await putDocument(doc, storedCopy());
    } catch {
      throw new Error(STORAGE_ERROR);
    }
    return { doc, isNew: true };
  } finally {
    if (pdf) destroyPdf(pdf);
  }
}
