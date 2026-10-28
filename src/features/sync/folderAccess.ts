import type { FsDirectoryHandle } from './fs';

export type FolderRoot =
  | { status: 'ready'; root: FsDirectoryHandle }
  | { status: 'unlinked' }
  | { status: 'needs-permission'; folderName: string };

/** What the reader needs from folder sync to open a book that lives in the linked folder. */
export interface FolderAccess {
  /**
   * The linked folder, if access is granted. With `request`, asks the browser
   * for access when needed (only possible during a user gesture).
   */
  root(options?: { request?: boolean }): Promise<FolderRoot>;
  /** Rescans the folder, e.g. after a book's file wasn't where the library expected. */
  rescan(): Promise<void>;
}

let current: FolderAccess | null = null;

/** Registered by the sync engine at startup. Kept separate so the reader doesn't import the engine. */
export function provideFolderAccess(access: FolderAccess | null): void {
  current = access;
}

export function folderAccess(): FolderAccess | null {
  return current;
}
