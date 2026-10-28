import type { FolderFileRecord } from '@/lib/storage/db';
import type { BookSource, DocId, LibraryDocument } from '@/lib/types';
import { baseName } from './paths';
import type { FileStamp } from './scan';

/**
 * Pure decisions behind a folder sync pass, kept free of I/O so they can be
 * tested exhaustively.
 */

export function sameStamp(a: FileStamp | undefined, b: FileStamp): boolean {
  return !!a && a.size === b.size && a.lastModified === b.lastModified;
}

export interface HashPlan<T extends FileStamp & { path: string }> {
  /** Path → content hash for files whose cached hash is still valid. */
  known: Map<string, DocId>;
  /** Files that must be read and hashed. */
  toHash: T[];
  /** New index records for files that moved: same size and time as a file that vanished. */
  moved: FolderFileRecord[];
  /** Index records whose file is gone. */
  stale: string[];
}

/**
 * Decides which PDFs need hashing. A cached hash is reused while a file's size
 * and modification time are unchanged, including when it was moved or renamed
 * (a file at a new path matching exactly one vanished file).
 */
export function planHashing<T extends FileStamp & { path: string }>(
  scanned: readonly T[],
  index: readonly FolderFileRecord[],
): HashPlan<T> {
  const byPath = new Map(index.map((record) => [record.path, record]));
  const present = new Set(scanned.map((file) => file.path));
  const vanished = index.filter((record) => !present.has(record.path));
  const stampKey = (stamp: FileStamp) => `${stamp.size}:${stamp.lastModified}`;
  const vanishedByStamp = new Map<string, FolderFileRecord[]>();
  for (const record of vanished) {
    const key = stampKey(record);
    vanishedByStamp.set(key, [...(vanishedByStamp.get(key) ?? []), record]);
  }

  const known = new Map<string, DocId>();
  const toHash: T[] = [];
  const moved: FolderFileRecord[] = [];
  const candidates: T[] = [];
  for (const file of scanned) {
    const record = byPath.get(file.path);
    if (record && sameStamp(record, file)) known.set(file.path, record.hash);
    else if (record) toHash.push(file);
    else candidates.push(file);
  }
  const candidatesByStamp = new Map<string, number>();
  for (const file of candidates)
    candidatesByStamp.set(stampKey(file), (candidatesByStamp.get(stampKey(file)) ?? 0) + 1);
  for (const file of candidates) {
    const key = stampKey(file);
    const matches = vanishedByStamp.get(key);
    // Only an unambiguous one-to-one match is trusted; anything else is rehashed.
    if (matches?.length === 1 && candidatesByStamp.get(key) === 1) {
      known.set(file.path, matches[0].hash);
      moved.push({
        path: file.path,
        size: file.size,
        lastModified: file.lastModified,
        hash: matches[0].hash,
      });
    } else {
      toHash.push(file);
    }
  }
  return { known, toHash, moved, stale: vanished.map((record) => record.path) };
}

export interface LibraryPlan {
  /** Books in the folder that aren't in the library yet: hash and chosen path. */
  create: { id: DocId; path: string }[];
  /** Folder books whose location or availability changed. */
  update: { id: DocId; source: BookSource; fileName?: string }[];
}

/**
 * Decides how the library must change to match the folder: new books are
 * added, moved books follow their file, and books whose file is gone are
 * marked missing (never removed, so their notes stay). Imported books are
 * left alone even if the same PDF is in the folder.
 */
export function planLibrary(
  docs: readonly LibraryDocument[],
  pathsByHash: ReadonlyMap<DocId, string[]>,
): LibraryPlan {
  const plan: LibraryPlan = { create: [], update: [] };
  const known = new Set<DocId>();
  for (const doc of docs) {
    known.add(doc.id);
    const source = doc.source;
    if (source?.kind !== 'folder') continue;
    const paths = pathsByHash.get(doc.id);
    if (!paths?.length) {
      if (!source.missing) plan.update.push({ id: doc.id, source: { ...source, missing: true } });
      continue;
    }
    const path = paths.includes(source.path) ? source.path : paths[0];
    if (path !== source.path || source.missing) {
      plan.update.push({ id: doc.id, source: { kind: 'folder', path }, fileName: baseName(path) });
    }
  }
  for (const [id, paths] of pathsByHash) {
    if (!known.has(id) && paths.length) plan.create.push({ id, path: paths[0] });
  }
  return plan;
}

/** Groups paths by content hash, each group sorted so the choice of path is stable. */
export function groupPathsByHash(hashes: ReadonlyMap<string, DocId>): Map<DocId, string[]> {
  const groups = new Map<DocId, string[]>();
  for (const [path, hash] of hashes) groups.set(hash, [...(groups.get(hash) ?? []), path]);
  for (const paths of groups.values()) paths.sort(comparePaths);
  return groups;
}

/** Shallower paths first, then alphabetical: prefers `Book.pdf` over `Old/Book.pdf`. */
export function comparePaths(a: string, b: string): number {
  const depth = (path: string) => path.split('/').length;
  return depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Files whose size or time differ from the last pass, i.e. need reading again. */
export function changedFiles<T extends FileStamp & { path: string }>(
  files: readonly T[],
  seen: ReadonlyMap<string, FileStamp>,
): T[] {
  return files.filter((file) => !sameStamp(seen.get(file.path), file));
}

export interface DeviceSummary {
  id: string;
  name: string;
  lastWriteAt: number;
}

/** Other devices that have written book files, most recently active first. */
export function summarizeDevices(
  known: ReadonlyMap<string, { name: string; lastWriteAt: number }>,
  present: Iterable<string>,
  ownId: string,
): DeviceSummary[] {
  const ids = new Set(present);
  return [...known]
    .filter(([id]) => id !== ownId && ids.has(id))
    .map(([id, { name, lastWriteAt }]) => ({ id, name, lastWriteAt }))
    .sort((a, b) => b.lastWriteAt - a.lastWriteAt || (a.id < b.id ? -1 : 1));
}

/** Folder books that still need their title, page count or cover read from the PDF. */
export function needsMetadata(doc: LibraryDocument): boolean {
  return doc.source?.kind === 'folder' && !doc.source.missing && (doc.pageCount === 0 || !doc.coverDataUrl);
}
