import type { DocId } from '@/lib/types';

/**
 * Layout of a linked library folder:
 *
 *   <folder>/…/<name>.pdf                          books, read in place
 *   <folder>/.scriptorium/README.txt               what this folder is
 *   <folder>/.scriptorium/devices/<device>/<book>.json
 *                                                  one device's view of one book
 *
 * Every device writes only inside its own `devices/<device>/` folder, so cloud
 * sync never has two devices editing the same file.
 */

export const SYNC_DIR = '.scriptorium';
export const DEVICES_DIR = 'devices';
export const README_NAME = 'README.txt';

export const README_TEXT = `Scriptorium
===========

This folder holds the notes, highlights, bookmarks and reading positions you
make in Scriptorium, so they follow your books to every device that opens this
library folder.

- It is safe to sync with OneDrive, Google Drive, Dropbox or iCloud Drive.
- Each device writes only to its own folder inside devices/, so syncing never
  creates conflicting copies.
- Please don't edit or rename these files. Scriptorium never changes your PDFs.
`;

export interface ScanLimits {
  /** Folder levels below the library folder that are searched for PDFs. */
  maxDepth: number;
  /** Directory entries examined per scan, a guard against pointing at a whole drive. */
  maxEntries: number;
  maxPdfs: number;
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = { maxDepth: 8, maxEntries: 50_000, maxPdfs: 5_000 };

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '__macosx',
  '$recycle.bin',
  'system volume information',
  '@eadir',
]);

/** Hidden folders (including `.scriptorium`) and system or tooling clutter are not searched. */
export function shouldScanDirectory(name: string): boolean {
  return !name.startsWith('.') && !name.startsWith('~') && !SKIPPED_DIRECTORIES.has(name.toLowerCase());
}

/** `*.pdf` in any case, excluding hidden files and editor or macOS resource-fork leftovers. */
export function isPdfFileName(name: string): boolean {
  return /\.pdf$/i.test(name) && !name.startsWith('.') && !name.startsWith('~$');
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** A readable provisional title from a file name, until the PDF's own title is read. */
export function titleFromFileName(fileName: string): string {
  return (
    fileName
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Untitled'
  );
}

export function bookFileName(bookId: DocId): string {
  return `${bookId}.json`;
}

/** The book id a device file is named after, or null for anything that isn't a book file. */
export function bookIdFromFileName(name: string): DocId | null {
  const match = /^([0-9a-f]{64})\.json$/.exec(name);
  return match ? match[1] : null;
}

/** Device folders are named by device id; anything hidden or odd is ignored. */
export function isDeviceDirectoryName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name);
}
