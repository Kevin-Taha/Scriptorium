import { create } from 'zustand';

/**
 * State of the linked library folder, shared by the sync engine (which owns the
 * implementation) and the UI (which only reads state and calls actions).
 *
 * - `unsupported`: this browser can't link folders (no File System Access API).
 * - `unlinked`: no folder linked yet.
 * - `needs-permission`: a folder is linked but the browser wants the reader to
 *   allow access again (after a restart); `reconnect()` must run from a click.
 * - `syncing` / `idle` / `error`: linked and active.
 */
export type FolderStatus = 'unsupported' | 'unlinked' | 'needs-permission' | 'syncing' | 'idle' | 'error';

export interface LinkedFolder {
  /** The folder's display name (browsers don't reveal full paths). */
  name: string;
  linkedAt: number;
}

export interface SyncProgress {
  /** Short description of the current step, e.g. "Adding books". */
  label: string;
  done: number;
  total: number;
}

export interface SyncState {
  status: FolderStatus;
  folder: LinkedFolder | null;
  lastSyncedAt: number | null;
  error: string | null;
  progress: SyncProgress | null;
  /** Other devices seen in the folder, newest activity first. */
  devices: { id: string; name: string; lastWriteAt: number }[];

  /** Opens the folder picker and links the chosen folder. Call from a click. */
  linkFolder(): Promise<void>;
  /** Re-grants access to the linked folder. Call from a click. */
  reconnect(): Promise<void>;
  /** Forgets the folder. Books stay in the library only if they were imported. */
  unlinkFolder(): Promise<void>;
  /** Rescans the folder and syncs annotations now. */
  syncNow(): Promise<void>;
}

const notReady = async () => {
  throw new Error('Folder sync has not started yet.');
};

export const useSyncStore = create<SyncState>()(() => ({
  status: 'unlinked',
  folder: null,
  lastSyncedAt: null,
  error: null,
  progress: null,
  devices: [],
  linkFolder: notReady,
  reconnect: notReady,
  unlinkFolder: notReady,
  syncNow: notReady,
}));
