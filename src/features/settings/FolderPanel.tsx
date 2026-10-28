import { useRef, useState } from 'react';
import {
  CircleAlert,
  FolderCheck,
  FolderOpen,
  FolderPlus,
  FolderSync,
  LoaderCircle,
  Monitor,
  RefreshCw,
  ShieldAlert,
  Unlink,
} from 'lucide-react';
import { ConfirmDialog } from '@/features/library/ConfirmDialog';
import { useSyncStore } from '@/features/sync/syncStore';
import {
  linkLibraryFolder,
  reconnectLibraryFolder,
  syncLibraryFolderNow,
  unlinkLibraryFolder,
} from './folderActions';
import { describeDeviceActivity, quoted, relativeTime } from './format';
import { StorageCard, StorageSection } from './StorageSection';
import { useNow } from './useNow';

const INTRO =
  'Keep your PDFs in a folder — on this computer, OneDrive, Dropbox or Google Drive — and Scriptorium reads them there and saves your notes beside them, so every device that opens the folder stays in step.';

export function FolderPanel() {
  const status = useSyncStore((s) => s.status);
  const folder = useSyncStore((s) => s.folder);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const error = useSyncStore((s) => s.error);
  const progress = useSyncStore((s) => s.progress);
  const devices = useSyncStore((s) => s.devices);
  const now = useNow();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const section = useRef<HTMLElement>(null);

  const name = folder ? quoted(folder.name) : 'your folder';

  const run = async (action: () => Promise<string | null>) => {
    setPending(true);
    setActionError(null);
    const message = await action();
    setPending(false);
    setActionError(message);
  };
  const link = () => run(linkLibraryFolder);
  const unlink = async () => {
    await run(unlinkLibraryFolder);
    setConfirmingUnlink(false);
    // The Unlink button is gone; keep keyboard focus inside the dialog, on the next thing to do.
    requestAnimationFrame(() => section.current?.querySelector<HTMLElement>('.btn--primary')?.focus());
  };

  const unlinkButton = (
    <button
      type="button"
      className="btn btn--ghost"
      disabled={pending}
      onClick={() => setConfirmingUnlink(true)}
    >
      <Unlink aria-hidden="true" />
      Unlink
    </button>
  );
  const changeButton = (
    <button type="button" className="btn" disabled={pending} onClick={() => void link()}>
      <FolderOpen aria-hidden="true" />
      Change folder…
    </button>
  );

  const card = () => {
    switch (status) {
      case 'unsupported':
        return (
          <StorageCard
            icon={<Monitor />}
            title="Folder sync needs Chrome or Edge on a computer."
            detail="Use backups below to move your notes."
          />
        );
      case 'unlinked':
        return (
          <StorageCard
            live
            busy={pending}
            icon={<FolderPlus />}
            title="No folder linked"
            detail="Using Google Drive? Install Google Drive for desktop, then choose a folder inside it."
          >
            <button type="button" className="btn btn--primary" disabled={pending} onClick={() => void link()}>
              <FolderOpen aria-hidden="true" />
              Link a folder…
            </button>
          </StorageCard>
        );
      case 'needs-permission':
        return (
          <StorageCard
            live
            busy={pending}
            tone="notice"
            icon={<ShieldAlert />}
            title={`Scriptorium needs your permission to open ${name} again.`}
            detail="Your browser asks this after a restart. Nothing has been lost."
          >
            <button
              type="button"
              className="btn btn--primary"
              disabled={pending}
              onClick={() => void run(reconnectLibraryFolder)}
            >
              <FolderSync aria-hidden="true" />
              Reconnect
            </button>
            {unlinkButton}
          </StorageCard>
        );
      case 'syncing':
        return (
          <StorageCard
            live
            busy
            icon={<LoaderCircle className="storage-spinner" />}
            title={progress?.label || `Syncing with ${name}`}
            detail={
              progress && progress.total > 0 ? (
                <>
                  <span>
                    {progress.done} of {progress.total}
                  </span>
                  <span
                    className="storage-progress"
                    role="progressbar"
                    aria-label="Sync progress"
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-valuenow={Math.min(progress.done, progress.total)}
                  >
                    <span style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }} />
                  </span>
                </>
              ) : undefined
            }
          />
        );
      case 'idle':
        return (
          <StorageCard
            live
            busy={pending}
            icon={<FolderCheck />}
            title={`Synced with ${name}`}
            detail={lastSyncedAt ? `Last synced ${relativeTime(lastSyncedAt, now)}` : undefined}
          >
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => void run(syncLibraryFolderNow)}
            >
              <RefreshCw aria-hidden="true" />
              Sync now
            </button>
            {changeButton}
            {unlinkButton}
          </StorageCard>
        );
      case 'error':
        return (
          <StorageCard
            live
            busy={pending}
            tone="error"
            icon={<CircleAlert />}
            title={error || 'Something went wrong while syncing.'}
          >
            <button
              type="button"
              className="btn btn--primary"
              disabled={pending}
              onClick={() => void run(folder ? syncLibraryFolderNow : linkLibraryFolder)}
            >
              <RefreshCw aria-hidden="true" />
              Try again
            </button>
            {folder && changeButton}
            {folder && unlinkButton}
          </StorageCard>
        );
    }
  };

  const showDevices = devices.length > 0 && folder !== null && status !== 'unsupported';

  return (
    <StorageSection ref={section} icon={<FolderSync />} title="Library folder" intro={INTRO}>
      {card()}
      {actionError && (
        <p className="storage-note storage-note--error" role="alert">
          {actionError}
        </p>
      )}
      {showDevices && (
        <div className="storage-devices">
          <p className="storage-devices__label">Also used by</p>
          <ul>
            {devices.map((device) => (
              <li key={device.id}>{describeDeviceActivity(device, now)}</li>
            ))}
          </ul>
        </div>
      )}
      {confirmingUnlink && (
        <ConfirmDialog
          title={`Unlink ${name}?`}
          description="Books from this folder leave your library on this device. Your notes stay in the folder and come back when you link it again."
          confirmLabel="Unlink"
          busyLabel="Unlinking…"
          busy={pending}
          onCancel={() => setConfirmingUnlink(false)}
          onConfirm={() => void unlink()}
        />
      )}
    </StorageSection>
  );
}
