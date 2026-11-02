/**
 * The subset of the File System Access API that folder sync uses. Handles from
 * `showDirectoryPicker`, the origin private file system, Google Drive folders
 * (`drive/driveFs.ts`) and the in-memory test double all satisfy these interfaces.
 */

export interface FsFile {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface FsWritable {
  write(data: string | ArrayBuffer | Uint8Array | Blob): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

export interface FsFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<FsFile>;
  createWritable(): Promise<FsWritable>;
}

export interface FsPermissionDescriptor {
  mode: 'read' | 'readwrite';
}

export interface FsDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<FsFileHandle | FsDirectoryHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
  isSameEntry?(other: FsDirectoryHandle): Promise<boolean>;
  /** Absent outside Chromium's File System Access API (e.g. some OPFS-only browsers). */
  queryPermission?(descriptor: FsPermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor: FsPermissionDescriptor): Promise<PermissionState>;
  /** Called once the folder is unlinked, to let go of anything kept for it (Google Drive folders). */
  forget?(): Promise<void>;
  /**
   * Keeps a copy of a book read while scanning, under its id, where downloads are costly (Google
   * Drive), so reading its details or opening it doesn't download it again.
   */
  keepBook?(id: string, bytes: ArrayBuffer): Promise<void>;
  /** A copy kept by `keepBook`, or null. */
  keptBook?(id: string): Promise<ArrayBuffer | null>;
}

const READ_WRITE: FsPermissionDescriptor = { mode: 'readwrite' };

type DirectoryPicker = (options: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FsDirectoryHandle>;

function directoryPicker(): DirectoryPicker | undefined {
  if (typeof window === 'undefined') return undefined;
  const picker = (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  return typeof picker === 'function' ? picker.bind(window) : undefined;
}

/** True when this browser can link a folder (Chromium-based desktop browsers). */
export function isFolderLinkingSupported(): boolean {
  return directoryPicker() !== undefined;
}

/** Asks the reader to choose a folder. Rejects with an `AbortError` if they cancel. */
export function pickDirectory(): Promise<FsDirectoryHandle> {
  const picker = directoryPicker();
  if (!picker) return Promise.reject(new Error('This browser can’t link folders.'));
  return picker({ id: 'scriptorium-library', mode: 'readwrite' });
}

/** Current read-write permission; handles without the permission API (OPFS) are always granted. */
export async function permissionState(handle: FsDirectoryHandle): Promise<PermissionState> {
  if (!handle.queryPermission) return 'granted';
  return handle.queryPermission(READ_WRITE);
}

/**
 * Resolves true if read-write access is granted. With `request`, prompts the
 * reader when needed, which browsers only allow during a user gesture.
 */
export async function ensurePermission(handle: FsDirectoryHandle, request: boolean): Promise<boolean> {
  try {
    if ((await permissionState(handle)) === 'granted') return true;
    if (!request || !handle.requestPermission) return false;
    return (await handle.requestPermission(READ_WRITE)) === 'granted';
  } catch {
    return false;
  }
}

export function errorName(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
    ? error.name
    : undefined;
}

export const isAbortError = (error: unknown) => errorName(error) === 'AbortError';
export const isNotFoundError = (error: unknown) => errorName(error) === 'NotFoundError';
export const isPermissionError = (error: unknown) =>
  errorName(error) === 'NotAllowedError' || errorName(error) === 'SecurityError';

/** Follows `/`-separated `path` from `root` to a file. Rejects with `NotFoundError` if absent. */
export async function resolveFile(root: FsDirectoryHandle, path: string): Promise<FsFileHandle> {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new DOMException(`No file at “${path}”.`, 'NotFoundError');
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part);
  return dir.getFileHandle(name);
}

/** The directory `name` inside `parent`, or null if it doesn't exist. */
export async function findDirectory(
  parent: FsDirectoryHandle,
  name: string,
): Promise<FsDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name);
  } catch (error) {
    if (isNotFoundError(error) || errorName(error) === 'TypeMismatchError') return null;
    throw error;
  }
}

/** The file `name` inside `dir`, or null if it doesn't exist. */
export async function findFile(dir: FsDirectoryHandle, name: string): Promise<FsFileHandle | null> {
  try {
    return await dir.getFileHandle(name);
  } catch (error) {
    if (isNotFoundError(error) || errorName(error) === 'TypeMismatchError') return null;
    throw error;
  }
}

/**
 * Replaces a file's contents. The browser writes to a temporary file and swaps
 * it in on `close()`, so cloud sync clients never see a half-written file.
 */
export async function writeTextFile(dir: FsDirectoryHandle, name: string, text: string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
  await writable.close();
}
