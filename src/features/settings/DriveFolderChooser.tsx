import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, Folder, LoaderCircle } from 'lucide-react';
import type { DriveItem } from '@/features/sync/drive/api';
import {
  type DriveChooserRequest,
  type DriveFolderChoice,
  useDriveChooserStore,
} from '@/features/sync/drive/chooser';
import './settings.css';

/** Lets the reader choose a folder in their Google Drive. Mounted once, in the app shell. */
export function DriveFolderChooser() {
  const request = useDriveChooserStore((s) => s.request);
  return request ? <ChooserDialog request={request} /> : null;
}

type Listing =
  | { status: 'loading' }
  | { status: 'ready'; folders: DriveItem[] }
  | { status: 'error'; message: string };

function ChooserDialog({ request }: { request: DriveChooserRequest }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const location = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  /** The folders opened below My Drive. */
  const [path, setPath] = useState<DriveFolderChoice[]>([]);
  const [listing, setListing] = useState<Listing>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const current = path.at(-1) ?? null;
  const parentId = current?.id ?? 'root';

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setListing({ status: 'loading' });
    request.list(parentId).then(
      (folders) => {
        if (!cancelled) setListing({ status: 'ready', folders });
      },
      (error: unknown) => {
        if (cancelled) return;
        console.warn('Scriptorium: couldn’t list Drive folders', error);
        setListing({
          status: 'error',
          message:
            error instanceof DOMException && error.name === 'NotAllowedError'
              ? 'Google signed Scriptorium out. Close this and choose the folder again.'
              : 'Couldn’t load your folders. Check your connection and try again.',
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request, parentId, attempt]);

  const open = (next: DriveFolderChoice[]) => {
    setPath(next);
    // The button that was clicked is gone; keep focus on where the reader is now.
    requestAnimationFrame(() => location.current?.querySelector<HTMLElement>('[aria-current]')?.focus());
  };

  return (
    <dialog
      ref={dialog}
      className="library-dialog drive-chooser"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={() => request.cancel()}
    >
      <h2 id={titleId}>Choose a Google Drive folder</h2>
      <p id={descriptionId}>
        Signed in as {request.account}. Scriptorium reads the PDFs in the folder you choose and keeps your
        notes in a “.scriptorium” folder inside it.
      </p>

      <nav className="drive-chooser__path" aria-label="Folder location" ref={location}>
        <button
          type="button"
          aria-current={path.length === 0 ? 'location' : undefined}
          onClick={() => open([])}
        >
          My Drive
        </button>
        {path.map((folder, index) => (
          <Fragment key={folder.id}>
            <ChevronRight aria-hidden="true" />
            <button
              type="button"
              aria-current={index === path.length - 1 ? 'location' : undefined}
              onClick={() => open(path.slice(0, index + 1))}
            >
              {folder.name}
            </button>
          </Fragment>
        ))}
      </nav>

      <div className="drive-chooser__list" aria-busy={listing.status === 'loading' || undefined}>
        {listing.status === 'loading' && (
          <p className="drive-chooser__message" role="status">
            <LoaderCircle className="storage-spinner" aria-hidden="true" />
            Loading folders…
          </p>
        )}
        {listing.status === 'error' && (
          <div className="drive-chooser__message" role="alert">
            <p>{listing.message}</p>
            <button type="button" className="btn btn--sm" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
        {listing.status === 'ready' && listing.folders.length === 0 && (
          <p className="drive-chooser__message">
            {current ? 'No folders inside this one.' : 'No folders in My Drive.'}
          </p>
        )}
        {listing.status === 'ready' && listing.folders.length > 0 && (
          <ul aria-label={`Folders in ${current?.name ?? 'My Drive'}`}>
            {listing.folders.map((folder) => (
              <li key={folder.id}>
                <button type="button" onClick={() => open([...path, { id: folder.id, name: folder.name }])}>
                  <Folder aria-hidden="true" />
                  <span>{folder.name}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="library-dialog__actions">
        <button
          type="button"
          className="btn"
          // biome-ignore lint/a11y/noAutofocus: focus moves into the modal when it opens
          autoFocus
          onClick={() => dialog.current?.close()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!current}
          onClick={() => current && request.choose(current)}
        >
          {current ? `Use “${current.name}”` : 'Open a folder to use it'}
        </button>
      </div>
    </dialog>
  );
}
