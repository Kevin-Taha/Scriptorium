import { contentHash } from '@/lib/hash';
import {
  type BookData,
  clearFolderFiles,
  deleteFolderFile,
  deleteMeta,
  getBookData,
  getDocument,
  getDocumentFile,
  getMeta,
  getReadingState,
  listDocIdsWithData,
  listDocuments,
  listFolderFiles,
  putDocument,
  putFolderFile,
  putMeta,
  removeDocumentEntry,
  updateDocument,
} from '@/lib/storage/repository';
import { mergeIntoLibrary } from '@/lib/sync/apply';
import {
  type BookFile,
  type BookInfo,
  bookInfoOf,
  createBookFile,
  type DeviceInfo,
  parseBookFile,
} from '@/lib/sync/bookFile';
import { getDevice } from '@/lib/sync/device';
import { canonicalBookData, isEmptyBookData, mergeBookData, stableStringify } from '@/lib/sync/merge';
import type { DocId, LibraryDocument } from '@/lib/types';
import { debounce, isAtStart } from '@/lib/util';
import type { FolderAccess, FolderRoot } from './folderAccess';
import {
  ensurePermission,
  errorName,
  findDirectory,
  findFile,
  type FsDirectoryHandle,
  type FsFileHandle,
  isAbortError,
  isFolderLinkingSupported,
  isPermissionError,
  pickDirectory,
  resolveFile,
  writeTextFile,
} from './fs';
import {
  baseName,
  bookFileName,
  DEFAULT_SCAN_LIMITS,
  DEVICES_DIR,
  README_NAME,
  README_TEXT,
  type ScanLimits,
  SYNC_DIR,
  titleFromFileName,
} from './paths';
import {
  changedFiles,
  groupPathsByHash,
  needsMetadata,
  planHashing,
  planLibrary,
  summarizeDevices,
} from './plan';
import { type FileStamp, type ScannedPdf, scanDeviceFiles, scanPdfs } from './scan';
import { type SyncState, useSyncStore } from './syncStore';

export interface BookMetadata {
  title: string;
  pageCount: number;
  coverDataUrl?: string;
}

/** What is remembered about the linked folder between visits. Directory handles survive structured cloning. */
export interface LinkedFolderRecord {
  handle: FsDirectoryHandle;
  name: string;
  linkedAt: number;
}

export interface FolderStore {
  load(): Promise<LinkedFolderRecord | undefined>;
  save(folder: LinkedFolderRecord): Promise<void>;
  clear(): Promise<void>;
}

const LINKED_FOLDER_KEY = 'linkedFolder';

/** Keeps the linked folder in the database's `meta` store. */
export const metaFolderStore: FolderStore = {
  load: () => getMeta<LinkedFolderRecord>(LINKED_FOLDER_KEY),
  save: (folder) => putMeta(LINKED_FOLDER_KEY, folder),
  clear: () => deleteMeta(LINKED_FOLDER_KEY),
};

export interface EngineOptions {
  /** Reads title, page count and cover from a PDF (pdf.js in the app, a fake in tests). */
  extractMetadata(bytes: ArrayBuffer, fileName: string): Promise<BookMetadata>;
  notify?(message: string, tone?: 'neutral' | 'error'): void;
  pickDirectory?(): Promise<FsDirectoryHandle>;
  isSupported?(): boolean;
  folderStore?: FolderStore;
  /** Delay before local edits are written to the folder. */
  writeDelayMs?: number;
  scanLimits?: ScanLimits;
}

/** Thrown inside a pass when the folder was unlinked or replaced while it ran. */
class Superseded extends Error {}

const ADDING_BOOKS = 'Adding books';
const BACKGROUND_MIN_INTERVAL_MS = 2_000;

/**
 * Keeps the library in step with a linked folder: finds the PDFs in it, adds
 * them to the library, and exchanges annotations with other devices through
 * `.scriptorium/devices/<device>/<book>.json`. Every pass is serialised with
 * every write, and nothing here throws to callers: failures land in the sync
 * store's `status` and `error`.
 */
export class FolderSyncEngine implements FolderAccess {
  private readonly options: EngineOptions;
  private readonly folderStore: FolderStore;
  private readonly limits: ScanLimits;

  private started: Promise<void> = Promise.resolve();
  private folder: LinkedFolderRecord | null = null;
  /** The linked folder while read-write access is granted. */
  private access: FsDirectoryHandle | null = null;
  /** Bumped whenever the folder is linked or unlinked, so stale work stops. */
  private generation = 0;

  private chain: Promise<unknown> = Promise.resolve();
  private passRunning: Promise<void> | null = null;
  private passQueued: Promise<void> | null = null;
  private queuedQuiet = true;
  private lastPassEndedAt = 0;

  /** Books with local changes not yet written to this device's files. */
  private readonly dirty = new Set<DocId>();
  /** Set after linking or reconnecting: compare every book with data against this device's files. */
  private verifyOwnFiles = true;
  /** Canonical device name and data last written to (or read from) this device's file for each book. */
  private readonly ownWritten = new Map<DocId, string>();
  /** Size and time of each other device's file when it was last read. */
  private readonly remoteStamps = new Map<string, FileStamp>();
  private readonly devicesSeen = new Map<string, { name: string; lastWriteAt: number }>();
  private devicesPresent = new Set<string>();
  private readonly remoteBooks = new Map<DocId, BookInfo>();

  private readonly metadataQueue = new Set<DocId>();
  private readonly metadataFailed = new Set<DocId>();
  private metadataRun: Promise<void> | null = null;

  private readonly scheduleWrite: ReturnType<typeof debounce<[]>>;

  constructor(options: EngineOptions) {
    this.options = options;
    this.folderStore = options.folderStore ?? metaFolderStore;
    this.limits = options.scanLimits ?? DEFAULT_SCAN_LIMITS;
    this.scheduleWrite = debounce(() => void this.flushWrites(), options.writeDelayMs ?? 2_000);
  }

  // ------------------------------------------------------------ lifecycle

  /** Restores the linked folder, if any, and syncs when access is still granted. */
  start(): Promise<void> {
    if (!this.isSupported()) this.set({ status: 'unsupported' });
    this.started = this.restore();
    return this.started;
  }

  private async restore(): Promise<void> {
    try {
      await getDevice();
      if (!this.isSupported()) return;
      const stored = await this.folderStore.load();
      if (!stored?.handle) {
        this.set({ status: 'unlinked', folder: null });
        return;
      }
      this.folder = stored;
      const folder = { name: stored.name, linkedAt: stored.linkedAt };
      if (await ensurePermission(stored.handle, false)) {
        this.access = stored.handle;
        this.set({ folder, status: 'syncing' });
        void this.sync();
      } else {
        this.set({ folder, status: 'needs-permission' });
      }
    } catch (error) {
      console.error('Scriptorium: couldn’t restore the linked folder', error);
      this.set({ status: 'error', error: 'Couldn’t restore your linked folder. Try linking it again.' });
    }
  }

  /** Lets the reader choose a folder and links it. Call from a click. */
  async link(): Promise<void> {
    await this.started;
    if (!this.isSupported()) {
      this.set({ status: 'unsupported' });
      return;
    }
    let handle: FsDirectoryHandle;
    try {
      handle = await (this.options.pickDirectory ?? pickDirectory)();
    } catch (error) {
      if (isAbortError(error)) return;
      console.error('Scriptorium: folder picker failed', error);
      this.notify('Couldn’t open that folder. Try choosing it again.', 'error');
      return;
    }
    try {
      if (!(await ensurePermission(handle, true))) {
        this.notify('Scriptorium needs permission to read and save files in that folder.', 'error');
        return;
      }
      const previous = this.folder;
      const same = previous ? await sameFolder(previous.handle, handle) : false;
      if (previous && !same) await this.unlink();
      const record: LinkedFolderRecord = {
        handle,
        name: handle.name,
        linkedAt: same && previous ? previous.linkedAt : Date.now(),
      };
      await this.folderStore.save(record);
      this.generation++;
      this.resetCaches();
      this.folder = record;
      this.access = handle;
      this.set({ folder: { name: record.name, linkedAt: record.linkedAt }, error: null });
      const others = await countOtherDevices(handle, (await getDevice()).id).catch(() => 0);
      this.notify(
        others > 0
          ? `Linked “${record.name}”. Found notes from ${others} other ${others === 1 ? 'device' : 'devices'}.`
          : `Linked “${record.name}”`,
      );
      await this.sync();
    } catch (error) {
      console.error('Scriptorium: linking the folder failed', error);
      this.set({ status: 'error', error: 'Couldn’t link that folder. Try again.' });
    }
  }

  /** Asks the browser for access to the linked folder again. Call from a click. */
  async reconnect(): Promise<void> {
    await this.started;
    const folder = this.folder;
    if (!folder) return;
    if (!(await ensurePermission(folder.handle, true))) {
      this.set({ status: 'needs-permission' });
      this.notify(
        `Scriptorium still can’t open “${folder.name}”. Allow access to keep your notes in sync.`,
        'error',
      );
      return;
    }
    this.access = folder.handle;
    this.verifyOwnFiles = true;
    await this.sync();
  }

  /**
   * Forgets the folder. Folder books leave the library, but their notes,
   * highlights and progress stay in the database, so linking the folder again
   * restores everything.
   */
  async unlink(): Promise<void> {
    await this.started;
    if (!this.folder) return;
    await this.flushWrites();
    this.generation++;
    this.scheduleWrite.cancel();
    await this.exclusive(async () => {
      this.folder = null;
      this.access = null;
      this.resetCaches();
      try {
        await this.folderStore.clear();
        await clearFolderFiles();
        for (const doc of await listDocuments()) {
          if (doc.source?.kind !== 'folder') continue;
          // A folder book that also has a copy stored here stays in the library as imported.
          if (await getDocumentFile(doc.id)) await updateDocument(doc.id, { source: { kind: 'imported' } });
          else await removeDocumentEntry(doc.id);
        }
      } catch (error) {
        console.error('Scriptorium: unlinking the folder failed', error);
      }
    });
    this.set({
      status: 'unlinked',
      folder: null,
      devices: [],
      lastSyncedAt: null,
      error: null,
      progress: null,
    });
    this.bumpRevision();
  }

  private resetCaches(): void {
    this.dirty.clear();
    this.verifyOwnFiles = true;
    this.ownWritten.clear();
    this.remoteStamps.clear();
    this.devicesSeen.clear();
    this.devicesPresent = new Set();
    this.remoteBooks.clear();
    this.metadataQueue.clear();
    this.metadataFailed.clear();
  }

  // --------------------------------------------------------------- passes

  /**
   * Rescans the folder and exchanges annotations. Passes never overlap: a
   * request during a pass queues one follow-up. `quiet` passes (timers,
   * focus) don't show the syncing state unless they find books to add.
   */
  sync(options: { quiet?: boolean } = {}): Promise<void> {
    const quiet = options.quiet ?? false;
    if (!this.passRunning) return this.startPass(quiet);
    if (!quiet) this.queuedQuiet = false;
    this.passQueued ??= this.passRunning.then(() => {
      this.passQueued = null;
      const queuedQuiet = this.queuedQuiet;
      this.queuedQuiet = true;
      return this.startPass(queuedQuiet);
    });
    return this.passQueued;
  }

  /** A quiet pass for timers and focus changes, skipped right after another pass. */
  syncInBackground(): void {
    if (!this.access || this.passQueued) return;
    if (!this.passRunning && Date.now() - this.lastPassEndedAt < BACKGROUND_MIN_INTERVAL_MS) return;
    void this.sync({ quiet: true });
  }

  private startPass(quiet: boolean): Promise<void> {
    const pass = this.exclusive(() => this.runPass(quiet)).finally(() => {
      this.lastPassEndedAt = Date.now();
      if (this.passRunning === pass) this.passRunning = null;
    });
    this.passRunning = pass;
    return pass;
  }

  /** Runs `task` after every earlier folder operation has finished. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async runPass(quiet: boolean): Promise<void> {
    const root = this.access;
    if (!root || !this.folder) return;
    const generation = this.generation;
    if (!quiet) this.set({ status: 'syncing' });
    try {
      if (!(await ensurePermission(root, false))) {
        this.loseAccess();
        return;
      }
      const device = await getDevice();
      const syncDir = await root.getDirectoryHandle(SYNC_DIR, { create: true });
      await this.ensureReadme(syncDir);
      const merged = await this.pullRemote(syncDir, device.id, generation);
      await this.followRemoteProgress(merged, device.id);
      await this.syncBooks(root, generation);
      for (const id of merged) this.dirty.add(id);
      if (this.verifyOwnFiles) for (const id of await listDocIdsWithData()) this.dirty.add(id);
      await this.writeDirty(syncDir, device, generation);
      this.verifyOwnFiles = false;
      this.checkCurrent(generation);
      this.set({
        status: 'idle',
        error: null,
        progress: null,
        lastSyncedAt: Date.now(),
        devices: summarizeDevices(this.devicesSeen, this.devicesPresent, device.id),
      });
      void this.pumpMetadata();
    } catch (error) {
      this.handleFailure(error, generation);
    }
  }

  private handleFailure(error: unknown, generation: number): void {
    if (error instanceof Superseded || generation !== this.generation) return;
    if (isPermissionError(error)) {
      this.loseAccess();
      return;
    }
    console.error('Scriptorium: folder sync failed', error);
    this.set({
      status: 'error',
      error: describeSyncError(error, this.folder?.name ?? 'your folder'),
      progress: null,
    });
  }

  private loseAccess(): void {
    this.access = null;
    this.set({ status: 'needs-permission', progress: null });
  }

  private checkCurrent(generation: number): void {
    if (generation !== this.generation) throw new Superseded();
  }

  private async ensureReadme(syncDir: FsDirectoryHandle): Promise<void> {
    if (!(await findFile(syncDir, README_NAME))) await writeTextFile(syncDir, README_NAME, README_TEXT);
  }

  // ---------------------------------------------------------------- books

  /** Brings the library in line with the PDFs in the folder. */
  private async syncBooks(root: FsDirectoryHandle, generation: number): Promise<void> {
    const scan = await scanPdfs(root, this.limits);
    this.checkCurrent(generation);
    if (scan.truncated)
      console.warn('Scriptorium: the linked folder is very large; only part of it was scanned.');
    const plan = planHashing(scan.pdfs, await listFolderFiles());
    for (const record of plan.moved) await putFolderFile(record);
    for (const path of plan.stale) await deleteFolderFile(path);

    const hashes = new Map(plan.known);
    const docs = new Map((await listDocuments()).map((doc) => [doc.id, doc]));
    const total = plan.toHash.length;
    let done = 0;
    if (total > 0) this.set({ status: 'syncing', progress: { label: ADDING_BOOKS, done, total } });
    for (const file of plan.toHash) {
      this.checkCurrent(generation);
      const hash = await this.hashFile(file);
      if (hash) {
        hashes.set(file.path, hash);
        // Add each new book as soon as it is identified, so big folders fill in progressively.
        if (!docs.has(hash)) docs.set(hash, await this.addFolderBook(hash, file.path, file.size));
      }
      this.set({ progress: { label: ADDING_BOOKS, done: ++done, total } });
    }

    this.checkCurrent(generation);
    const sizes = new Map(scan.pdfs.map((file) => [file.path, file.size]));
    const changes = planLibrary([...docs.values()], groupPathsByHash(hashes));
    for (const { id, path } of changes.create)
      docs.set(id, await this.addFolderBook(id, path, sizes.get(path) ?? 0));
    for (const { id, source, fileName } of changes.update) {
      await updateDocument(id, fileName ? { source, fileName } : { source });
    }
    if (changes.update.length > 0) this.bumpRevision();
    for (const doc of docs.values()) if (needsMetadata(doc)) this.queueMetadata(doc.id);
  }

  private async hashFile(file: ScannedPdf): Promise<DocId | null> {
    try {
      const snapshot = await file.handle.getFile();
      const hash = await contentHash(await snapshot.arrayBuffer());
      await putFolderFile({
        path: file.path,
        size: snapshot.size,
        lastModified: snapshot.lastModified,
        hash,
      });
      return hash;
    } catch (error) {
      if (isPermissionError(error)) throw error;
      // Unreadable right now (locked, online-only, being written): the next pass tries again.
      console.warn(`Scriptorium: couldn’t read “${file.path}”`, error);
      return null;
    }
  }

  private async addFolderBook(id: DocId, path: string, size: number): Promise<LibraryDocument> {
    // The book may have been imported while this pass was running; never overwrite it.
    const current = await getDocument(id);
    if (current) return current;
    const fileName = baseName(path);
    const known = this.remoteBooks.get(id);
    const progress = await getReadingState(id);
    const now = Date.now();
    const doc: LibraryDocument = {
      id,
      title: known && known.pageCount > 0 ? known.title : titleFromFileName(fileName),
      fileName,
      fileSize: size,
      pageCount: known?.pageCount ?? 0,
      addedAt: now,
      // Never opened anywhere yet: 0 sorts it after books being read. Reading from another device counts,
      // but a position at the very start (such as after "Reset progress") means not started.
      lastOpenedAt: progress && !isAtStart(progress.location) ? progress.updatedAt : 0,
      source: { kind: 'folder', path },
    };
    await putDocument(doc);
    this.bumpRevision();
    this.queueMetadata(id);
    void this.pumpMetadata();
    return doc;
  }

  // ------------------------------------------------------------- metadata

  private queueMetadata(id: DocId): void {
    if (!this.metadataFailed.has(id)) this.metadataQueue.add(id);
  }

  /** Reads titles, page counts and covers of new folder books, one at a time. */
  private pumpMetadata(): Promise<void> {
    if (this.metadataRun) return this.metadataRun;
    const run = (async () => {
      for (const id of this.metadataQueue) {
        this.metadataQueue.delete(id);
        await this.readMetadata(id);
      }
    })().catch((error) => console.warn('Scriptorium: reading book details stopped', error));
    this.metadataRun = run;
    void run.then(() => {
      if (this.metadataRun !== run) return;
      this.metadataRun = null;
      if (this.metadataQueue.size > 0) void this.pumpMetadata();
    });
    return run;
  }

  private async readMetadata(id: DocId): Promise<void> {
    const root = this.access;
    const generation = this.generation;
    if (!root) return;
    const doc = await getDocument(id);
    if (!doc || !needsMetadata(doc) || doc.source?.kind !== 'folder') return;
    try {
      const file = await (await resolveFile(root, doc.source.path)).getFile();
      const metadata = await this.options.extractMetadata(await file.arrayBuffer(), doc.fileName);
      if (generation !== this.generation) return;
      await updateDocument(id, {
        title: metadata.title,
        pageCount: metadata.pageCount,
        coverDataUrl: metadata.coverDataUrl ?? doc.coverDataUrl,
      });
      if (!metadata.coverDataUrl) this.metadataFailed.add(id);
      this.bumpRevision();
    } catch (error) {
      this.metadataFailed.add(id);
      console.warn(`Scriptorium: couldn’t read details of “${doc.fileName}”`, error);
    }
  }

  // ---------------------------------------------------------- annotations

  /** Reads other devices' changed files and merges them in. Returns the books that changed here. */
  private async pullRemote(
    syncDir: FsDirectoryHandle,
    ownId: string,
    generation: number,
  ): Promise<Set<DocId>> {
    const entries = await scanDeviceFiles(syncDir);
    const present = new Set(entries.map((entry) => entry.path));
    for (const path of this.remoteStamps.keys()) if (!present.has(path)) this.remoteStamps.delete(path);

    // Our own files only matter if they vanished (e.g. the folder was cleaned up): write them again.
    const ownBooks = new Set(entries.filter((e) => e.deviceId === ownId).map((e) => e.bookId));
    for (const id of [...this.ownWritten.keys()]) {
      if (!ownBooks.has(id)) {
        this.ownWritten.delete(id);
        this.dirty.add(id);
      }
    }

    const remote = entries.filter((entry) => entry.deviceId !== ownId);
    this.devicesPresent = new Set(remote.map((entry) => entry.deviceId));
    const incoming = new Map<DocId, BookData[]>();
    const read: [string, FileStamp][] = [];
    for (const entry of changedFiles(remote, this.remoteStamps)) {
      this.checkCurrent(generation);
      const stamp = { size: entry.size, lastModified: entry.lastModified };
      const file = await readBookFile(entry.handle);
      if (!file || file.book.id !== entry.bookId) {
        // Unreadable, half-synced or from a newer app version: try again once it changes.
        this.remoteStamps.set(entry.path, stamp);
        continue;
      }
      const seen = this.devicesSeen.get(entry.deviceId);
      const writtenAt = file.writtenAt || entry.lastModified;
      if (!seen || writtenAt >= seen.lastWriteAt) {
        this.devicesSeen.set(entry.deviceId, { name: file.device.name, lastWriteAt: writtenAt });
      }
      if (!this.remoteBooks.has(file.book.id) || file.book.pageCount > 0)
        this.remoteBooks.set(file.book.id, file.book);
      incoming.set(file.book.id, [...(incoming.get(file.book.id) ?? []), file.data]);
      read.push([entry.path, stamp]);
    }

    // Publish who wrote before merging, so notices about merged data can name the device.
    this.set({ devices: summarizeDevices(this.devicesSeen, this.devicesPresent, ownId) });
    const merged = new Set<DocId>();
    for (const [docId, sets] of incoming) {
      this.checkCurrent(generation);
      if (await mergeIntoLibrary(docId, sets)) merged.add(docId);
    }
    // Only now: if merging failed, these files are read again next pass.
    for (const [path, stamp] of read) this.remoteStamps.set(path, stamp);
    return merged;
  }

  /**
   * Lets books read on another device rise to the top of the library ("continue reading"). A position
   * at the very start doesn't count: nothing was read, or the book was reset there.
   */
  private async followRemoteProgress(merged: ReadonlySet<DocId>, ownId: string): Promise<void> {
    let changed = false;
    for (const id of merged) {
      const [doc, progress] = await Promise.all([getDocument(id), getReadingState(id)]);
      if (
        doc &&
        progress &&
        progress.deviceId !== ownId &&
        progress.updatedAt > doc.lastOpenedAt &&
        !isAtStart(progress.location)
      ) {
        await updateDocument(id, { lastOpenedAt: progress.updatedAt });
        changed = true;
      }
    }
    if (changed) this.bumpRevision();
  }

  /** Records a local edit; it is written to the folder shortly after. */
  noteLocalChange(docId: DocId): void {
    if (!this.folder) return;
    this.dirty.add(docId);
    this.scheduleWrite();
  }

  /** Rewrites this device's files under its new name, so other devices show it. */
  deviceRenamed(): void {
    if (!this.folder) return;
    this.verifyOwnFiles = true;
    void this.sync({ quiet: true });
  }

  /** Writes pending local edits now (e.g. when the page is being hidden). */
  flushWrites(): Promise<void> {
    this.scheduleWrite.cancel();
    if (!this.access || this.dirty.size === 0) return Promise.resolve();
    const generation = this.generation;
    return this.exclusive(async () => {
      const root = this.access;
      if (!root || generation !== this.generation || this.dirty.size === 0) return;
      try {
        const syncDir = await root.getDirectoryHandle(SYNC_DIR, { create: true });
        await this.writeDirty(syncDir, await getDevice(), generation);
      } catch (error) {
        this.handleFailure(error, generation);
      }
    });
  }

  private async writeDirty(
    syncDir: FsDirectoryHandle,
    device: DeviceInfo,
    generation: number,
  ): Promise<void> {
    if (this.dirty.size === 0) return;
    const ids = [...this.dirty].sort();
    this.dirty.clear();
    let deviceDir: FsDirectoryHandle | null = null;
    for (let i = 0; i < ids.length; i++) {
      try {
        this.checkCurrent(generation);
        deviceDir ??= await (
          await syncDir.getDirectoryHandle(DEVICES_DIR, { create: true })
        ).getDirectoryHandle(device.id, { create: true });
        await this.writeOwnFile(deviceDir, device, ids[i]);
      } catch (error) {
        for (const id of ids.slice(i)) this.dirty.add(id);
        throw error;
      }
    }
  }

  /** Writes this device's merged view of a book, unless the file already says the same. */
  private async writeOwnFile(dir: FsDirectoryHandle, device: DeviceInfo, id: DocId): Promise<void> {
    const data = await getBookData(id);
    if (isEmptyBookData(data)) return;
    const normalized = mergeBookData([data]);
    const content = ownFileContent(device.name, stableStringify(normalized));
    const previous = this.ownWritten.get(id) ?? (await readOwnFileContent(dir, id));
    if (previous !== content) {
      const doc = await getDocument(id);
      const book = doc
        ? bookInfoOf(doc)
        : (this.remoteBooks.get(id) ?? { id, title: 'Untitled', fileName: '', pageCount: 0 });
      await writeTextFile(dir, bookFileName(id), JSON.stringify(createBookFile(book, device, normalized)));
    }
    this.ownWritten.set(id, content);
  }

  // ------------------------------------------------------- reader access

  async root(options: { request?: boolean } = {}): Promise<FolderRoot> {
    await this.started;
    const folder = this.folder;
    if (!folder) return { status: 'unlinked' };
    if (this.access) return { status: 'ready', root: this.access };
    if (await ensurePermission(folder.handle, options.request ?? false)) {
      this.access = folder.handle;
      this.verifyOwnFiles = true;
      void this.sync();
      return { status: 'ready', root: folder.handle };
    }
    return { status: 'needs-permission', folderName: folder.name };
  }

  rescan(): Promise<void> {
    return this.sync({ quiet: true });
  }

  /** Resolves once no pass, write or metadata read is pending (tests and shutdown). */
  async whenIdle(): Promise<void> {
    for (;;) {
      await Promise.allSettled([this.passRunning, this.passQueued, this.metadataRun, this.chain]);
      if (!this.passRunning && !this.passQueued && !this.metadataRun) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // -------------------------------------------------------------- helpers

  private isSupported(): boolean {
    return (this.options.isSupported ?? isFolderLinkingSupported)();
  }

  private notify(message: string, tone: 'neutral' | 'error' = 'neutral'): void {
    this.options.notify?.(message, tone);
  }

  private set(patch: Partial<SyncState>): void {
    useSyncStore.setState(patch);
  }

  private bumpRevision(): void {
    useSyncStore.setState((state) => ({ libraryRevision: state.libraryRevision + 1 }));
  }
}

async function sameFolder(a: FsDirectoryHandle, b: FsDirectoryHandle): Promise<boolean> {
  if (a === b) return true;
  try {
    return (await a.isSameEntry?.(b)) ?? false;
  } catch {
    return false;
  }
}

async function readBookFile(handle: FsFileHandle): Promise<BookFile | null> {
  try {
    return parseBookFile(JSON.parse(await (await handle.getFile()).text()));
  } catch {
    return null;
  }
}

/** What makes this device's file for a book current: its name and the book's canonical data. */
function ownFileContent(deviceName: string, canonicalData: string): string {
  return `${deviceName}\n${canonicalData}`;
}

async function readOwnFileContent(dir: FsDirectoryHandle, id: DocId): Promise<string | undefined> {
  const handle = await findFile(dir, bookFileName(id));
  const file = handle ? await readBookFile(handle) : null;
  return file ? ownFileContent(file.device.name, canonicalBookData(file.data)) : undefined;
}

/** Other devices that left book files in `root`, for the "found notes" message when linking. */
async function countOtherDevices(root: FsDirectoryHandle, ownId: string): Promise<number> {
  const syncDir = await findDirectory(root, SYNC_DIR);
  if (!syncDir) return 0;
  const devices = new Set((await scanDeviceFiles(syncDir)).map((entry) => entry.deviceId));
  devices.delete(ownId);
  return devices.size;
}

export function describeSyncError(error: unknown, folderName: string): string {
  switch (errorName(error)) {
    case 'NotFoundError':
      return `Couldn’t find “${folderName}”. It may have been moved, renamed or disconnected — link it again to keep syncing.`;
    case 'QuotaExceededError':
      return `There’s no space left to save notes in “${folderName}”.`;
    case 'NoModificationAllowedError':
    case 'InvalidModificationError':
      return `“${folderName}” is read-only or busy, so notes couldn’t be saved there. Scriptorium will try again.`;
    default:
      return `Couldn’t sync with “${folderName}”. Scriptorium will try again shortly.`;
  }
}
