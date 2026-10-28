/**
 * Asking the browser to keep Scriptorium's data. Without this, browsers treat
 * site storage as "best effort" and may evict it under disk pressure. Chromium
 * grants it silently for installed or frequently used apps; Firefox asks.
 * Even when persisted, "Clear site data" still erases it — the linked library
 * folder and backups cover that case.
 */

export interface StorageStatus {
  /** null when the browser can't report it. */
  persisted: boolean | null;
  usage?: number;
  quota?: number;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = navigator.storage;
  if (!storage) return { persisted: null };
  const [persisted, estimate] = await Promise.all([
    storage.persisted ? storage.persisted().catch(() => null) : null,
    storage.estimate ? storage.estimate().catch(() => undefined) : undefined,
  ]);
  return { persisted, usage: estimate?.usage, quota: estimate?.quota };
}
