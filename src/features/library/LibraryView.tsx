import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, FilePlus, LibraryBig, LoaderCircle, UploadCloud } from 'lucide-react';
import { navigate } from '@/app/router';
import { InstallButton } from '@/app/pwa/InstallButton';
import { ThemeMenu } from '@/app/ThemeMenu';
import { showToast } from '@/components/Toast';
import { deleteDocument, getReadingState, listDocuments } from '@/lib/storage/repository';
import type { LibraryDocument, ReadingState } from '@/lib/types';
import { formatRelativeTime } from '@/lib/util';
import { BookCard, BookCover } from './BookCard';
import { ConfirmDialog } from './ConfirmDialog';
import { importPdfFile } from './importPdf';
import './library.css';

interface LibraryEntry {
  doc: LibraryDocument;
  reading?: ReadingState;
}

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function LibraryView() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<LibraryDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const importLock = useRef(false);
  const dragDepth = useRef(0);
  const loadVersion = useRef(0);
  const removalOpener = useRef<HTMLButtonElement | null>(null);

  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const docs = await listDocuments();
      const next = await Promise.all(
        docs.map(async (doc) => ({ doc, reading: await getReadingState(doc.id) })),
      );
      if (version === loadVersion.current) {
        setEntries(next);
        setLoadError(false);
      }
    } catch {
      if (version === loadVersion.current) setLoadError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const versionCounter = loadVersion;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    const onFocus = () => {
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      versionCounter.current++;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const importFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || importLock.current) return;
      importLock.current = true;
      setImporting(true);
      let added = 0;
      let duplicates = 0;
      let errors = 0;
      let singleResult: Awaited<ReturnType<typeof importPdfFile>> | undefined;
      try {
        for (const file of files) {
          try {
            const result = await importPdfFile(file);
            if (result.isNew) added++;
            else duplicates++;
            if (files.length === 1) singleResult = result;
          } catch (error) {
            errors++;
            showToast(
              error instanceof Error ? error.message : 'That file couldn’t be opened. Nothing was added.',
              { tone: 'error' },
            );
          }
        }
        await refresh();
        if (singleResult) {
          showToast(
            singleResult.isNew
              ? `Added “${singleResult.doc.title}”`
              : `“${singleResult.doc.title}” is already in your library`,
          );
          navigate({ name: 'reader', docId: singleResult.doc.id });
        } else if (files.length > 1 && added > 0) {
          showToast(`Added ${added} ${added === 1 ? 'book' : 'books'}`);
        } else if (files.length > 1 && duplicates > 0 && errors === 0) {
          showToast('These books are already in your library');
        }
      } finally {
        importLock.current = false;
        setImporting(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const resetDrag = () => {
      dragDepth.current = 0;
      setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      resetDrag();
      void importFiles(Array.from(event.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('blur', resetDrag);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('blur', resetDrag);
    };
  }, [importFiles]);

  const closeDialog = () => {
    setRemoving(null);
    requestAnimationFrame(() => removalOpener.current?.focus());
  };
  const confirmRemoval = async () => {
    if (!removing || deleting) return;
    setDeleting(true);
    try {
      await deleteDocument(removing.id);
      setRemoving(null);
      await refresh();
      requestAnimationFrame(() => openButton.current?.focus());
      showToast(`Removed “${removing.title}”`);
    } catch {
      showToast('Couldn’t remove this book. Please try again.', { tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };
  const openPicker = () => fileInput.current?.click();
  const openBook = (doc: LibraryDocument) => navigate({ name: 'reader', docId: doc.id });
  const recent = entries?.[0];

  return (
    <main className="library">
      <div className="library__topline">
        <div className="library__brand">
          <BookOpen aria-hidden="true" />
          <span>Scriptorium</span>
        </div>
        <div className="library__topline-actions">
          <InstallButton />
          <ThemeMenu />
        </div>
      </div>
      <header className="library__header">
        <div>
          <p className="library__eyebrow">YOUR READING ROOM</p>
          <h1>Library</h1>
        </div>
        <button
          type="button"
          ref={openButton}
          className="btn btn--primary library__open"
          onClick={openPicker}
          disabled={importing}
        >
          {importing ? (
            <LoaderCircle className="library__spinner" aria-hidden="true" />
          ) : (
            <FilePlus aria-hidden="true" />
          )}
          {importing ? 'Importing…' : 'Open PDF'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Choose PDFs to import"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void importFiles(files);
          }}
        />
      </header>

      {loadError && (
        <div className="library__error" role="alert">
          Couldn’t load your library.{' '}
          <button type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}
      {!entries && !loadError && (
        <p className="library__loading" role="status">
          Opening your library…
        </p>
      )}
      {entries?.length === 0 && !loadError && (
        <section
          className={`dropzone library__empty ${dragging ? 'is-dragover' : ''}`}
          aria-labelledby="library-empty-title"
        >
          <div className="empty-state">
            <div className="library__empty-illustration" aria-hidden="true">
              <span className="library__empty-paper library__empty-paper--back" />
              <span className="library__empty-paper library__empty-paper--front">
                <BookOpen />
              </span>
            </div>
            <p className="library__empty-kicker">A SPACE FOR YOUR BOOKS</p>
            <h2 className="empty-state__title" id="library-empty-title">
              Begin your library
            </h2>
            <p className="empty-state__body">
              Drop a PDF here, or open one from your computer. Everything stays on this device.
            </p>
            <div className="empty-state__actions">
              <button type="button" className="btn btn--primary" onClick={openPicker} disabled={importing}>
                {importing ? (
                  <LoaderCircle className="library__spinner" aria-hidden="true" />
                ) : (
                  <FilePlus aria-hidden="true" />
                )}
                {importing ? 'Importing…' : 'Open PDF'}
              </button>
            </div>
          </div>
        </section>
      )}
      {recent && (
        <>
          <section aria-labelledby="continue-heading" className="library__continue-section">
            <div className="library__section-heading">
              <h2 id="continue-heading">Pick up where you left off</h2>
              <span>LAST OPENED</span>
            </div>
            <div className="card library__continue">
              <BookCover doc={recent.doc} className="library__continue-cover" />
              <div className="library__continue-info">
                <p className="library__continue-label">CONTINUE READING</p>
                <h3>{recent.doc.title}</h3>
                <p>
                  Page {recent.reading?.location.page ?? 1} of {recent.doc.pageCount}{' '}
                  <span aria-hidden="true">·</span> {formatRelativeTime(recent.doc.lastOpenedAt)}
                </p>
              </div>
              <button type="button" className="btn btn--primary" onClick={() => openBook(recent.doc)}>
                Continue reading
              </button>
            </div>
          </section>
          <section aria-labelledby="books-heading" className="library__books">
            <div className="library__section-heading">
              <h2 id="books-heading">Your books</h2>
              <span>
                {entries.length} {entries.length === 1 ? 'BOOK' : 'BOOKS'}
              </span>
            </div>
            <div className="library__grid">
              {entries.map(({ doc, reading }) => (
                <BookCard
                  key={doc.id}
                  doc={doc}
                  reading={reading}
                  onOpen={() => openBook(doc)}
                  onRemove={(opener) => {
                    removalOpener.current = opener;
                    setRemoving(doc);
                  }}
                />
              ))}
            </div>
          </section>
        </>
      )}
      {dragging && (
        <div className="library__drop-overlay" aria-hidden="true">
          <div className="dropzone is-dragover library__drop-message">
            <UploadCloud />
            <strong>Drop your PDFs here</strong>
            <span>They’ll stay on this device.</span>
          </div>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove “${removing.title}”?`}
          description="This deletes the book and its notes, bookmarks and reading progress from this device."
          busy={deleting}
          onCancel={closeDialog}
          onConfirm={() => void confirmRemoval()}
        />
      )}
      <span className="visually-hidden" aria-live="polite">
        {importing ? 'Importing PDFs' : ''}
      </span>
      <span className="library__footer">
        <LibraryBig aria-hidden="true" /> Your books stay on this device
      </span>
    </main>
  );
}
