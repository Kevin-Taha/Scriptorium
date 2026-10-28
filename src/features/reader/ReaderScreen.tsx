import { useEffect } from 'react';
import { ArrowLeft, BookX } from 'lucide-react';
import { navigate } from '@/app/router';
import { NotesReview } from '../notes/NotesReview';
import { ReaderView } from './ReaderView';
import { useReaderStore } from './readerStore';

interface ReaderScreenProps {
  docId: string;
  view: 'reader' | 'review';
}

/** Loads a document and shows either the reader or the collated notes review. */
export function ReaderScreen({ docId, view }: ReaderScreenProps) {
  const status = useReaderStore((s) => s.status);
  const error = useReaderStore((s) => s.error);
  const loadedId = useReaderStore((s) => s.docId);
  const openDocument = useReaderStore((s) => s.openDocument);

  useEffect(() => {
    void openDocument(docId);
  }, [docId, openDocument]);

  useEffect(() => () => useReaderStore.getState().closeDocument(), []);

  if (status === 'error') {
    return (
      <div className="screen-center">
        <div className="empty-state">
          <div className="empty-state__icon">
            <BookX />
          </div>
          <h1 className="empty-state__title">Couldn’t open this book</h1>
          <p className="empty-state__body">{error}</p>
          <div className="empty-state__actions">
            <button type="button" className="btn btn--primary" onClick={() => navigate({ name: 'library' })}>
              <ArrowLeft /> Back to library
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status !== 'ready' || loadedId !== docId) {
    return (
      <div className="screen-center" aria-busy="true">
        <div className="loading-mark" role="status">
          <span className="loading-mark__spinner" aria-hidden="true" />
          Opening book…
        </div>
      </div>
    );
  }

  return view === 'review' ? <NotesReview /> : <ReaderView />;
}
