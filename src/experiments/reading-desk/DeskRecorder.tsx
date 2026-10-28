import { useEffect } from 'react';
import { useReaderStore } from '@/features/reader/readerStore';
import { buildMeta, saveMeta } from './deskMeta';

/**
 * Reader slot: while a book is open, remembers its chapter list and page count
 * for the library's desk (the library never loads PDFs itself).
 */
export function DeskRecorder() {
  const docId = useReaderStore((s) => s.docId);
  const status = useReaderStore((s) => s.status);
  const outline = useReaderStore((s) => s.outline);
  const pageCount = useReaderStore((s) => s.pdf?.numPages ?? s.doc?.pageCount ?? 0);

  useEffect(() => {
    if (!docId || status !== 'ready' || pageCount <= 0) return;
    saveMeta(docId, buildMeta(outline, pageCount));
  }, [docId, status, outline, pageCount]);

  return null;
}
