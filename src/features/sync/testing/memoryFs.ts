import type { FsDirectoryHandle, FsFile, FsFileHandle, FsPermissionDescriptor, FsWritable } from '../fs';

/**
 * An in-memory stand-in for File System Access directory handles, for unit
 * tests of folder sync. Implements just what sync uses, with the same error
 * names browsers throw, and gives every write a strictly increasing
 * modification time so change detection behaves like a real disk.
 */

let clock = 1_700_000_000_000;
function tick(): number {
  clock = Math.max(clock + 1, Date.now());
  return clock;
}

const notFound = (name: string) => new DOMException(`“${name}” was not found.`, 'NotFoundError');
const typeMismatch = (name: string) =>
  new DOMException(`“${name}” is the wrong kind of entry.`, 'TypeMismatchError');

type Data = string | ArrayBuffer | Uint8Array | Blob;

async function toBytes(data: Data): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data.slice();
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  return new Uint8Array(await data.arrayBuffer());
}

class MemoryFile implements FsFile {
  constructor(
    readonly name: string,
    private readonly bytes: Uint8Array,
    readonly lastModified: number,
  ) {}

  get size(): number {
    return this.bytes.length;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.bytes.slice().buffer;
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(this.bytes);
  }
}

export class MemoryFileHandle implements FsFileHandle {
  readonly kind = 'file' as const;
  /** Completed writes through `createWritable`, so tests can assert a file was not rewritten. */
  writes = 0;

  constructor(
    readonly name: string,
    private bytes: Uint8Array = new Uint8Array(),
    private lastModified = tick(),
  ) {}

  async getFile(): Promise<FsFile> {
    return new MemoryFile(this.name, this.bytes, this.lastModified);
  }

  async createWritable(): Promise<FsWritable> {
    const chunks: Uint8Array[] = [];
    let open = true;
    return {
      write: async (data) => {
        if (!open) throw new DOMException('The stream is closed.', 'InvalidStateError');
        chunks.push(await toBytes(data));
      },
      // Like browsers, the new contents replace the file only when the stream closes.
      close: async () => {
        open = false;
        this.replace(concat(chunks));
        this.writes++;
      },
      abort: async () => {
        open = false;
      },
    };
  }

  /** Replaces the contents directly, as another program or a cloud sync client would. */
  replace(bytes: Uint8Array, lastModified = tick()): void {
    this.bytes = bytes;
    this.lastModified = lastModified;
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export class MemoryDirectoryHandle implements FsDirectoryHandle {
  readonly kind = 'directory' as const;
  private readonly entries = new Map<string, MemoryFileHandle | MemoryDirectoryHandle>();
  /** What `queryPermission` reports; `requestPermission` answers with `grantOnRequest`. */
  permission: PermissionState = 'granted';
  grantOnRequest: PermissionState = 'granted';

  constructor(readonly name: string) {}

  async *values(): AsyncIterableIterator<MemoryFileHandle | MemoryDirectoryHandle> {
    yield* [...this.entries.values()];
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryDirectoryHandle> {
    const entry = this.entries.get(name);
    if (entry instanceof MemoryDirectoryHandle) return entry;
    if (entry) throw typeMismatch(name);
    if (!options.create) throw notFound(name);
    const created = new MemoryDirectoryHandle(name);
    this.entries.set(name, created);
    return created;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryFileHandle> {
    const entry = this.entries.get(name);
    if (entry instanceof MemoryFileHandle) return entry;
    if (entry) throw typeMismatch(name);
    if (!options.create) throw notFound(name);
    const created = new MemoryFileHandle(name);
    this.entries.set(name, created);
    return created;
  }

  async removeEntry(name: string, options: { recursive?: boolean } = {}): Promise<void> {
    const entry = this.entries.get(name);
    if (!entry) throw notFound(name);
    if (entry instanceof MemoryDirectoryHandle && entry.entries.size > 0 && !options.recursive) {
      throw new DOMException(`“${name}” is not empty.`, 'InvalidModificationError');
    }
    this.entries.delete(name);
  }

  async isSameEntry(other: FsDirectoryHandle): Promise<boolean> {
    return other === this;
  }

  async queryPermission(_descriptor: FsPermissionDescriptor): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(_descriptor: FsPermissionDescriptor): Promise<PermissionState> {
    if (this.permission !== 'granted') this.permission = this.grantOnRequest;
    return this.permission;
  }

  /** Places an existing entry under `name`, e.g. to move a file between folders. */
  attach(name: string, entry: MemoryFileHandle | MemoryDirectoryHandle): void {
    this.entries.set(name, entry);
  }
}

// ------------------------------------------------------------ path helpers

function split(path: string): { dirs: string[]; name: string } {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error(`Invalid path “${path}”.`);
  return { dirs: parts, name };
}

async function directoryOf(root: MemoryDirectoryHandle, dirs: string[], create: boolean) {
  let dir = root;
  for (const part of dirs) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

/** Creates or replaces the file at `path`, creating folders on the way. */
export async function writeFile(
  root: MemoryDirectoryHandle,
  path: string,
  data: Data,
): Promise<MemoryFileHandle> {
  const { dirs, name } = split(path);
  const handle = await (await directoryOf(root, dirs, true)).getFileHandle(name, { create: true });
  handle.replace(await toBytes(data));
  return handle;
}

export async function getFileHandle(root: MemoryDirectoryHandle, path: string): Promise<MemoryFileHandle> {
  const { dirs, name } = split(path);
  return (await directoryOf(root, dirs, false)).getFileHandle(name);
}

export async function readText(root: MemoryDirectoryHandle, path: string): Promise<string> {
  return (await (await getFileHandle(root, path)).getFile()).text();
}

export async function exists(root: MemoryDirectoryHandle, path: string): Promise<boolean> {
  try {
    await getFileHandle(root, path);
    return true;
  } catch {
    return false;
  }
}

export async function removePath(root: MemoryDirectoryHandle, path: string): Promise<void> {
  const { dirs, name } = split(path);
  await (await directoryOf(root, dirs, false)).removeEntry(name, { recursive: true });
}

/** Moves a file, keeping its contents and modification time (like a move on the same disk). */
export async function movePath(root: MemoryDirectoryHandle, from: string, to: string): Promise<void> {
  const file = await (await getFileHandle(root, from)).getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  await removePath(root, from);
  const target = split(to);
  (await directoryOf(root, target.dirs, true)).attach(
    target.name,
    new MemoryFileHandle(target.name, bytes, file.lastModified),
  );
}

/** Every file path under `root`, sorted. */
export async function listPaths(root: MemoryDirectoryHandle, prefix = ''): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of root.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry instanceof MemoryDirectoryHandle) paths.push(...(await listPaths(entry, path)));
    else paths.push(path);
  }
  return paths.sort();
}
