import type { FsDirectoryHandle } from './fs';
import type { FolderProvider } from './syncStore';

export type FolderRoot =
  | { status: 'ready'; root: FsDirectoryHandle; provider: FolderProvider }
  | { status: 'unlinked' }
  | { status: 'needs-permission'; folderName: string; provider: FolderProvider };

/** What the reader needs from folder sync to open a book that lives in the linked folder. */
export interface FolderAccess {
  /**
   * The linked folder, if access is granted. With `request`, asks the browser
   * for access when needed (only possible during a user gesture).
   */
  root(options?: { request?: boolean }): Promise<FolderRoot>;
  /** Rescans the folder, e.g. after a book's file wasn't where the library expected. */
  rescan(): Promise<void>;
  /** A copy of a folder book kept in the browser (Google Drive folders), readable without access. */
  keptBook(id: string): Promise<ArrayBuffer | null>;
}

let current: FolderAccess | null = null;

/** Registered by the sync engine at startup. Kept separate so the reader doesn't import the engine. */
export function provideFolderAccess(access: FolderAccess | null): void {
  current = access;
}

export function folderAccess(): FolderAccess | null {
  return current;
}
