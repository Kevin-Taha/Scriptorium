import type { DocId } from '@/lib/types';
import type { FsDirectoryHandle, FsFileHandle } from './fs';
import {
  bookIdFromFileName,
  DEFAULT_SCAN_LIMITS,
  DEVICES_DIR,
  isDeviceDirectoryName,
  isPdfFileName,
  joinPath,
  type ScanLimits,
  shouldScanDirectory,
} from './paths';

/** Size and modification time: enough to tell whether a file changed without reading it. */
export interface FileStamp {
  size: number;
  lastModified: number;
}

export interface ScannedPdf extends FileStamp {
  /** Relative to the library folder, `/`-separated. */
  path: string;
  handle: FsFileHandle;
}

export interface PdfScan {
  pdfs: ScannedPdf[];
  /** True if a limit stopped the scan early, so some PDFs may be missing. */
  truncated: boolean;
}

const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Finds every PDF in the library folder, reading only file metadata. */
export async function scanPdfs(
  root: FsDirectoryHandle,
  limits: ScanLimits = DEFAULT_SCAN_LIMITS,
): Promise<PdfScan> {
  const pdfs: ScannedPdf[] = [];
  let entries = 0;
  let truncated = false;

  async function walk(dir: FsDirectoryHandle, prefix: string, depth: number): Promise<void> {
    const subdirectories: FsDirectoryHandle[] = [];
    const files: FsFileHandle[] = [];
    for await (const entry of dir.values()) {
      if (++entries > limits.maxEntries) {
        truncated = true;
        break;
      }
      if (entry.kind === 'directory') {
        if (depth < limits.maxDepth && shouldScanDirectory(entry.name)) subdirectories.push(entry);
      } else if (isPdfFileName(entry.name)) {
        files.push(entry);
      }
    }
    for (const handle of files.sort(byName)) {
      if (pdfs.length >= limits.maxPdfs) {
        truncated = true;
        return;
      }
      try {
        const file = await handle.getFile();
        pdfs.push({
          path: joinPath(prefix, handle.name),
          handle,
          size: file.size,
          lastModified: file.lastModified,
        });
      } catch (error) {
        // Locked or not-yet-downloaded files are picked up by a later scan.
        console.warn(`Scriptorium: skipped “${joinPath(prefix, handle.name)}”`, error);
      }
    }
    for (const subdirectory of subdirectories.sort(byName)) {
      if (truncated) return;
      await walk(subdirectory, joinPath(prefix, subdirectory.name), depth + 1);
    }
  }

  await walk(root, '', 0);
  return { pdfs, truncated };
}

export interface DeviceFileEntry extends FileStamp {
  deviceId: string;
  bookId: DocId;
  /** Unique key: `<device>/<book>.json`. */
  path: string;
  handle: FsFileHandle;
}

/** Lists every device's book files in `.scriptorium/`, reading only file metadata. */
export async function scanDeviceFiles(syncDir: FsDirectoryHandle): Promise<DeviceFileEntry[]> {
  let devicesDir: FsDirectoryHandle | null = null;
  for await (const entry of syncDir.values()) {
    if (entry.kind === 'directory' && entry.name === DEVICES_DIR) devicesDir = entry;
  }
  if (!devicesDir) return [];
  const result: DeviceFileEntry[] = [];
  for await (const deviceDir of devicesDir.values()) {
    if (deviceDir.kind !== 'directory' || !isDeviceDirectoryName(deviceDir.name)) continue;
    for await (const entry of deviceDir.values()) {
      const bookId = entry.kind === 'file' ? bookIdFromFileName(entry.name) : null;
      if (!bookId || entry.kind !== 'file') continue;
      try {
        const file = await entry.getFile();
        result.push({
          deviceId: deviceDir.name,
          bookId,
          path: `${deviceDir.name}/${entry.name}`,
          handle: entry,
          size: file.size,
          lastModified: file.lastModified,
        });
      } catch (error) {
        console.warn(`Scriptorium: skipped device file “${deviceDir.name}/${entry.name}”`, error);
      }
    }
  }
  return result.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
