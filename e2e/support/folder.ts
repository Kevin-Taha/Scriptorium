import { expect, type Page } from '@playwright/test';

/** The origin-private folder that stands in for the reader's library folder (e.g. OneDrive\Textbooks). */
const FOLDER = 'library';

/** Makes "Link a folder…" pick a folder in the origin private file system instead of opening a dialog. */
export async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript((folder) => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle(folder, { create: true }),
    });
  }, FOLDER);
}

/** Creates or replaces a file in the library folder, creating subfolders on the way. */
export async function writeFolderFile(page: Page, path: string, data: Buffer | string): Promise<void> {
  const base64 = (typeof data === 'string' ? Buffer.from(data) : data).toString('base64');
  await page.evaluate(
    async ({ folder, path, base64 }) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder, { create: true });
      const parts = path.split('/');
      const name = parts.pop()!;
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
      await writable.close();
    },
    { folder: FOLDER, path, base64 },
  );
}

/** A file's text, or null if it doesn't exist. */
export function readFolderFile(page: Page, path: string): Promise<string | null> {
  return page.evaluate(
    async ({ folder, path }) => {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder);
        const parts = path.split('/');
        const name = parts.pop()!;
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        return await (await (await dir.getFileHandle(name)).getFile()).text();
      } catch {
        return null;
      }
    },
    { folder: FOLDER, path },
  );
}

/** Names inside a folder of the library folder ([] if it doesn't exist). */
export function listFolder(page: Page, path: string): Promise<string[]> {
  return page.evaluate(
    async ({ folder, path }) => {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder);
        for (const part of path.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part);
        const names: string[] = [];
        for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys())
          names.push(name);
        return names.sort();
      } catch {
        return [];
      }
    },
    { folder: FOLDER, path },
  );
}

export async function removeFolderFile(page: Page, path: string): Promise<void> {
  await page.evaluate(
    async ({ folder, path }) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder);
      const parts = path.split('/');
      const name = parts.pop()!;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      await dir.removeEntry(name);
    },
    { folder: FOLDER, path },
  );
}

/** What this browser's device folder is called, once it has written something. */
export async function ownDeviceId(page: Page, otherDevices: string[] = []): Promise<string> {
  let id = '';
  await expect
    .poll(async () => {
      id =
        (await listFolder(page, '.scriptorium/devices')).find((name) => !otherDevices.includes(name)) ?? '';
      return id;
    })
    .not.toBe('');
  return id;
}

/** Nudges the app to sync, as switching back to its window would. */
export async function focusApp(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

/** Deletes the app's IndexedDB database, as "clear browsing data" would, while keeping the folder. */
export async function clearLibraryDatabase(page: Page): Promise<void> {
  // A page of the same origin that doesn't run the app, so nothing holds the database open.
  await page.goto('/favicon.svg');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('scriptorium');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
}

/** Number of PDFs stored inside the browser (imported books). */
export function storedPdfCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('scriptorium');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const count = db.transaction('files').objectStore('files').count();
          count.onsuccess = () => {
            resolve(count.result);
            db.close();
          };
          count.onerror = () => reject(count.error);
        };
      }),
  );
}
