import { getDocument, getDocumentFile, listFolderFiles } from '@/lib/storage/repository';
import type { LibraryDocument } from '@/lib/types';
import { type FolderAccess, folderAccess } from './folderAccess';
import { errorName, type FsDirectoryHandle, type FsFile, isPermissionError, resolveFile } from './fs';

type FolderBook = LibraryDocument & { source: { kind: 'folder'; path: string; missing?: boolean } };

const NOT_IN_LIBRARY = 'This book is no longer in your library.';
const IMPORTED_UNREADABLE =
  'This book’s saved copy couldn’t be read. Import the same PDF again to restore it — your notes, bookmarks and progress are kept.';

/**
 * The PDF bytes of a library book: from browser storage for imported books,
 * or straight from the linked folder for folder books. Throws errors with
 * messages written for the reader.
 */
export async function readBookBytes(doc: LibraryDocument): Promise<ArrayBuffer> {
  if (doc.source?.kind === 'folder') return readFromFolder(doc as FolderBook);
  const file = await getDocumentFile(doc.id);
  if (!file) throw new Error(NOT_IN_LIBRARY);
  try {
    return await file.arrayBuffer();
  } catch {
    throw new Error(IMPORTED_UNREADABLE);
  }
}

function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation?.isActive === true;
}

function needsPermission(folderName: string, drive: boolean): Error {
  return new Error(
    drive
      ? `Sign in to Google Drive again to open books from “${folderName}”. Go back to the library and choose Reconnect — your notes are kept.`
      : `Scriptorium needs your permission to open “${folderName}” again. Go back to the library and choose Reconnect — your notes are kept.`,
  );
}

async function readFromFolder(doc: FolderBook): Promise<ArrayBuffer> {
  const access = folderAccess();
  // Books from Google Drive are kept in the browser once read, so they reopen offline and signed out.
  const kept = await access?.keptBook(doc.id);
  if (kept) return kept;
  const folder = access
    ? await access.root({ request: hasUserActivation() })
    : ({ status: 'unlinked' } as const);
  if (!access || folder.status === 'unlinked') {
    throw new Error(
      `“${doc.title}” is in a library folder that isn’t linked any more. Link the folder again from the library to read it — your notes are kept.`,
    );
  }
  const drive = folder.provider === 'google-drive';
  if (folder.status === 'needs-permission') throw needsPermission(folder.folderName, drive);

  try {
    const bytes = await readCurrent(access, folder.root, doc);
    if (bytes) {
      await folder.root.keepBook?.(doc.id, bytes);
      return bytes;
    }
  } catch (error) {
    if (isPermissionError(error)) throw needsPermission(folder.root.name, drive);
    throw new Error(
      drive
        ? `Couldn’t download “${doc.fileName}” from Google Drive. Check your connection and try again.`
        : `Couldn’t read “${doc.fileName}” from your library folder. If it’s stored online only, make it available offline and try again.`,
      { cause: error },
    );
  }
  throw new Error(
    `Couldn’t find “${doc.fileName}” in your library folder. If you moved or deleted it, put it back — your notes and progress are kept.`,
  );
}

/** The book's bytes from the folder, rescanning once if the file moved or changed since the last scan. */
async function readCurrent(
  access: FolderAccess,
  root: FsDirectoryHandle,
  doc: FolderBook,
): Promise<ArrayBuffer | null> {
  const first = doc.source.missing ? null : await tryRead(root, doc);
  if (first) return first;
  await access.rescan();
  const fresh = await getDocument(doc.id);
  return fresh?.source?.kind === 'folder' && !fresh.source.missing
    ? tryRead(root, fresh as FolderBook)
    : null;
}

/** Reads the book's file if it is still the exact PDF the library knows; null otherwise. */
async function tryRead(root: FsDirectoryHandle, doc: FolderBook): Promise<ArrayBuffer | null> {
  let file: FsFile;
  try {
    file = await (await resolveFile(root, doc.source.path)).getFile();
  } catch (error) {
    if (errorName(error) === 'NotFoundError' || errorName(error) === 'TypeMismatchError') return null;
    throw error;
  }
  const record = (await listFolderFiles()).find((r) => r.path === doc.source.path);
  // A changed size or time means a different PDF may sit here now (e.g. a new edition saved over it).
  if (
    !record ||
    record.hash !== doc.id ||
    record.size !== file.size ||
    record.lastModified !== file.lastModified
  ) {
    return null;
  }
  return file.arrayBuffer();
}
