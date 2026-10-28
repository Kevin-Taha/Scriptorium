import { type ReactNode, useState } from 'react';
import { CircleAlert, FolderCheck, FolderSync, LoaderCircle, ShieldAlert } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { reconnectLibraryFolder } from '@/features/settings/folderActions';
import { quoted, relativeTime } from '@/features/settings/format';
import { openLibraryStorageDialog } from '@/features/settings/storageDialogStore';
import { useNow } from '@/features/settings/useNow';
import { useSyncStore } from '@/features/sync/syncStore';

interface ChipView {
  tone: 'idle' | 'syncing' | 'error';
  icon: ReactNode;
  label: string;
  detail?: string;
  /** Spoken when the state changes; kept short so progress ticks don't chatter. */
  announcement: string;
}

/**
 * Where the linked library folder stands, under the library heading. Opens
 * "Library & storage"; when the browser needs the reader's permission again it
 * reconnects in place, since that has to happen from a click.
 */
export function FolderStatusChip() {
  const status = useSyncStore((s) => s.status);
  const folder = useSyncStore((s) => s.folder);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const progress = useSyncStore((s) => s.progress);
  const now = useNow();
  const [reconnecting, setReconnecting] = useState(false);

  if (!folder) return null;
  const name = quoted(folder.name);

  const reconnect = async () => {
    setReconnecting(true);
    const message = await reconnectLibraryFolder();
    setReconnecting(false);
    if (message) showToast(message, { tone: 'error' });
  };

  if (status === 'needs-permission') {
    return (
      <div className="library__status-row">
        <button
          type="button"
          className="folder-chip folder-chip--notice"
          disabled={reconnecting}
          onClick={() => void reconnect()}
        >
          <ShieldAlert aria-hidden="true" />
          <span className="folder-chip__name">Reconnect {name}</span>
        </button>
        <span className="visually-hidden" role="status">
          {name} needs your permission to keep syncing.
        </span>
      </div>
    );
  }

  const chip: ChipView = (() => {
    switch (status) {
      case 'syncing':
        return {
          tone: 'syncing',
          icon: <LoaderCircle className="folder-chip__spinner" aria-hidden="true" />,
          label:
            progress && progress.total > 0
              ? `${progress.label} ${progress.done} / ${progress.total}`
              : `Syncing ${name}…`,
          announcement: `Syncing ${name}`,
        };
      case 'error':
        return {
          tone: 'error',
          icon: <CircleAlert aria-hidden="true" />,
          label: `Couldn’t sync ${name}`,
          announcement: `Couldn’t sync ${name}`,
        };
      default:
        return {
          tone: 'idle',
          icon: lastSyncedAt ? <FolderCheck aria-hidden="true" /> : <FolderSync aria-hidden="true" />,
          label: folder.name,
          detail: lastSyncedAt ? `· synced ${relativeTime(lastSyncedAt, now)}` : undefined,
          announcement: `${name} is up to date`,
        };
    }
  })();

  return (
    <div className="library__status-row">
      <button
        type="button"
        className={`folder-chip folder-chip--${chip.tone}`}
        aria-haspopup="dialog"
        onClick={(event) => openLibraryStorageDialog(event.currentTarget)}
      >
        {chip.icon}
        <span className="folder-chip__name">{chip.label}</span>
        {chip.detail && <span className="folder-chip__detail">{chip.detail}</span>}
      </button>
      <span className="visually-hidden" role="status">
        {chip.announcement}
      </span>
    </div>
  );
}
