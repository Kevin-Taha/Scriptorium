import { useEffect, useRef } from 'react';
import { HardDrive, X } from 'lucide-react';
import { BackupPanel } from './BackupPanel';
import { DevicePanel } from './DevicePanel';
import { FolderPanel } from './FolderPanel';
import { StoragePanel } from './StoragePanel';
import { closeLibraryStorageDialog, useStorageDialogStore } from './storageDialogStore';
import './settings.css';

/** "Library & storage": where books and notes live, and how to keep them safe. Mounted once, in the app shell. */
export function LibraryStorageDialog() {
  const open = useStorageDialogStore((s) => s.open);
  return open ? <StorageDialog /> : null;
}

function StorageDialog() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="storage-dialog"
      aria-labelledby="storage-dialog-title"
      // React bubbles a nested dialog's close event (the unlink confirmation) up to here.
      onClose={(event) => {
        if (event.target === event.currentTarget) closeLibraryStorageDialog();
      }}
    >
      <header className="storage-dialog__header">
        <span className="storage-dialog__icon" aria-hidden="true">
          <HardDrive />
        </span>
        <div className="storage-dialog__heading">
          <h2 id="storage-dialog-title">Library & storage</h2>
          <p>Where your books and notes live, and how to keep them safe.</p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm"
          aria-label="Close library and storage"
          // biome-ignore lint/a11y/noAutofocus: focus moves into the modal when it opens
          autoFocus
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
      </header>
      <div className="storage-dialog__body">
        <FolderPanel />
        <DevicePanel />
        <BackupPanel />
        <StoragePanel />
      </div>
    </dialog>
  );
}
