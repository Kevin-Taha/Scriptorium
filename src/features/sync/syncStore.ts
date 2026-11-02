import { create } from 'zustand';

/**
 * State of the linked library folder, shared by the sync engine (which owns the
 * implementation) and the UI (which only reads state and calls actions).
 *
 * - `unsupported`: no kind of folder can be linked here (no File System Access
 *   API, and this build doesn't offer Google Drive).
 * - `unlinked`: no folder linked yet.
 * - `needs-permission`: a folder is linked but the browser (or Google, about
 *   hourly) wants the reader to allow access again; `reconnect()` must run from a click.
 * - `syncing` / `idle` / `error`: linked and active.
 */
export type FolderStatus = 'unsupported' | 'unlinked' | 'needs-permission' | 'syncing' | 'idle' | 'error';

/** Where the linked folder lives: on this device (or a cloud drive's desktop folder), or in Google Drive itself. */
export type FolderProvider = 'local' | 'google-drive';

export interface LinkedFolder {
  /** The folder's display name (browsers don't reveal full paths). */
  name: string;
  linkedAt: number;
  provider: FolderProvider;
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
  /**
   * Increments whenever sync adds, updates or removes library entries (new
   * folder books, covers read, files gone missing, unlinking). Library views
   * reload their list when it changes.
   */
  libraryRevision: number;
  /** This browser can link a local folder (Chromium on a computer). */
  canLinkLocal: boolean;
  /** This build offers Google Drive folders (it has a Google client id). */
  canLinkDrive: boolean;

  /** Opens the folder picker and links the chosen folder. Call from a click. */
  linkFolder(): Promise<void>;
  /** Signs in to Google Drive, lets the reader choose a Drive folder and links it. Call from a click. */
  linkDriveFolder(): Promise<void>;
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
  libraryRevision: 0,
  canLinkLocal: true,
  canLinkDrive: false,
  linkFolder: notReady,
  linkDriveFolder: notReady,
  reconnect: notReady,
  unlinkFolder: notReady,
  syncNow: notReady,
}));
