import type { FsDirectoryHandle, FsFile, FsFileHandle, FsWritable } from '../fs';
import { type DriveItem, isBinaryFile, isFolder } from './api';
import { chooseDriveFolder } from './chooser';
import { type DriveSession, driveSession } from './session';

/**
 * A Google Drive folder behind the same directory-handle interface as a local folder, so folder
 * sync, the reader and their tests don't need to know where the folder lives. It only reads, and
 * creates or replaces the files folder sync writes (in `.scriptorium/`); it never deletes anything.
 */

/** What is remembered about a linked Drive folder between visits. */
export interface DriveFolderRef {
  id: string;
  name: string;
  /** The Google account it belongs to, so signing in again can skip Google's account chooser. */
  account?: string;
}

const notFound = (name: string) => new DOMException(`“${name}” isn’t in Google Drive.`, 'NotFoundError');
const typeMismatch = (name: string) =>
  new DOMException(`“${name}” is the wrong kind of entry.`, 'TypeMismatchError');

function mimeTypeFor(name: string): string {
  if (/\.json$/i.test(name)) return 'application/json';
  if (/\.txt$/i.test(name)) return 'text/plain';
  return 'application/octet-stream';
}

export class DriveDirectoryHandle implements FsDirectoryHandle {
  readonly kind = 'directory' as const;

  constructor(
    private readonly session: DriveSession,
    readonly id: string,
    readonly name: string,
    readonly account?: string,
  ) {}

  ref(): DriveFolderRef {
    return this.account
      ? { id: this.id, name: this.name, account: this.account }
      : { id: this.id, name: this.name };
  }

  async *values(): AsyncIterableIterator<DriveFileHandle | DriveDirectoryHandle> {
    const seen = new Set<string>();
    for (const item of await this.session.client.children(this.id)) {
      // Paths are `/`-separated, and a second entry with the same name is a duplicate (the oldest wins).
      const key = `${isFolder(item) ? 'd' : 'f'}:${item.name}`;
      if (item.name.includes('/') || seen.has(key)) continue;
      if (isFolder(item)) yield this.folder(item);
      else if (isBinaryFile(item)) yield new DriveFileHandle(this.session, this.id, item.name, item);
      else continue;
      seen.add(key);
    }
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<DriveDirectoryHandle> {
    const items = await this.session.client.childrenNamed(this.id, name);
    const folder = items.find(isFolder);
    if (folder) return this.folder(folder);
    if (items.some(isBinaryFile)) throw typeMismatch(name);
    if (!options.create) throw notFound(name);
    return this.folder(await this.session.client.createFolder(this.id, name));
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<DriveFileHandle> {
    const items = await this.session.client.childrenNamed(this.id, name);
    const file = items.find(isBinaryFile);
    if (file) return new DriveFileHandle(this.session, this.id, name, file);
    if (items.some(isFolder)) throw typeMismatch(name);
    if (!options.create) throw notFound(name);
    // Like the File System Access API, but the file appears in Drive with its first write.
    return new DriveFileHandle(this.session, this.id, name);
  }

  async isSameEntry(other: FsDirectoryHandle): Promise<boolean> {
    return other instanceof DriveDirectoryHandle && other.id === this.id;
  }

  /** Granted while Google's access token is fresh; afterwards the reader reconnects with a click. */
  async queryPermission(): Promise<PermissionState> {
    return this.session.auth.accessToken() ? 'granted' : 'prompt';
  }

  async requestPermission(): Promise<PermissionState> {
    if (this.session.auth.accessToken()) return 'granted';
    try {
      await this.session.auth.authorize();
      return 'granted';
    } catch (error) {
      console.warn('Scriptorium: Google sign-in didn’t finish', error);
      return 'prompt';
    }
  }

  /** Unlinking: drop the copies of this folder's books kept in the browser. */
  async forget(): Promise<void> {
    await this.session.books.clear();
  }

  keepBook(id: string, bytes: ArrayBuffer): Promise<void> {
    return this.session.books.put(id, bytes);
  }

  keptBook(id: string): Promise<ArrayBuffer | null> {
    return this.session.books.get(id);
  }

  private folder(item: DriveItem): DriveDirectoryHandle {
    return new DriveDirectoryHandle(this.session, item.id, item.name, this.account);
  }
}

export class DriveFileHandle implements FsFileHandle {
  readonly kind = 'file' as const;

  constructor(
    private readonly session: DriveSession,
    private readonly parentId: string,
    readonly name: string,
    private item?: DriveItem,
  ) {}

  async getFile(): Promise<FsFile> {
    const item = this.item;
    const client = this.session.client;
    const read = async () => (item ? client.download(item.id) : new ArrayBuffer(0));
    return {
      name: this.name,
      size: Number(item?.size ?? 0),
      lastModified: item ? Date.parse(item.modifiedTime) : 0,
      arrayBuffer: read,
      text: async () => new TextDecoder().decode(await read()),
    };
  }

  async createWritable(): Promise<FsWritable> {
    const parts: BlobPart[] = [];
    let open = true;
    return {
      write: async (data) => {
        if (!open) throw new DOMException('The stream is closed.', 'InvalidStateError');
        parts.push(data as BlobPart);
      },
      // The new contents reach Drive in one upload, when the stream closes.
      close: async () => {
        if (!open) throw new DOMException('The stream is closed.', 'InvalidStateError');
        open = false;
        const mimeType = mimeTypeFor(this.name);
        const content = new Blob(parts, { type: mimeType });
        const client = this.session.client;
        this.item = this.item
          ? await client.updateFile(this.item.id, mimeType, content)
          : await client.createFile(this.parentId, this.name, mimeType, content);
      },
      abort: async () => {
        open = false;
      },
    };
  }
}

export function isDriveFolder(handle: FsDirectoryHandle): handle is DriveDirectoryHandle {
  return handle instanceof DriveDirectoryHandle;
}

/** A remembered Drive folder, ready for sync once the reader is signed in. */
export function openDriveFolder(
  ref: DriveFolderRef,
  session: DriveSession = driveSession(),
): DriveDirectoryHandle {
  session.auth.setAccountHint(ref.account);
  session.auth.preload();
  return new DriveDirectoryHandle(session, ref.id, ref.name, ref.account);
}

/**
 * Signs in to Google (call from a click) and lets the reader choose a folder in their Drive.
 * Rejects with an `AbortError` if they cancel the chooser.
 */
export async function pickDriveFolder(session: DriveSession = driveSession()): Promise<DriveDirectoryHandle> {
  await session.auth.authorize();
  const account = await session.client.account();
  session.auth.setAccountHint(account.emailAddress);
  const folder = await chooseDriveFolder({
    account: account.emailAddress,
    list: (parentId) => session.client.folders(parentId),
  });
  return new DriveDirectoryHandle(session, folder.id, folder.name, account.emailAddress);
}
