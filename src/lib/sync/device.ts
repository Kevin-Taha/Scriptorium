import { getMeta, putMeta } from '../storage/repository';
import { createId } from '../util';
import type { DeviceInfo } from './bookFile';

const DEVICE_KEY = 'device';

let cached: DeviceInfo | null = null;
let loading: Promise<DeviceInfo> | null = null;

type RenameListener = (device: DeviceInfo) => void;
const renameListeners = new Set<RenameListener>();

/** Notifies `listener` after this device is renamed (sync rewrites its files). Returns an unsubscribe. */
export function onDeviceRenamed(listener: RenameListener): () => void {
  renameListeners.add(listener);
  return () => renameListeners.delete(listener);
}

/** A friendly default such as "Edge on Windows", from the user agent. */
export function describeDevice(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /CrOS/.test(userAgent)
            ? 'ChromeOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  return os ? `${browser} on ${os}` : browser;
}

/**
 * This device's identity, created on first use. It lives in browser storage,
 * so clearing site data makes the browser a new device; that is harmless,
 * because sync merges every device's data.
 */
export function getDevice(): Promise<DeviceInfo> {
  if (cached) return Promise.resolve(cached);
  loading ??= (async () => {
    const stored = await getMeta<DeviceInfo>(DEVICE_KEY);
    const device = stored?.id ? stored : { id: createId(), name: describeDevice(navigator.userAgent) };
    if (!stored?.id) await putMeta(DEVICE_KEY, device);
    cached = device;
    return device;
  })();
  return loading;
}

/** The device id if it has been loaded, for synchronous callers such as progress saving. */
export function currentDeviceId(): string | undefined {
  return cached?.id;
}

export async function renameDevice(name: string): Promise<DeviceInfo> {
  const device = { ...(await getDevice()), name: name.trim() || describeDevice(navigator.userAgent) };
  await putMeta(DEVICE_KEY, device);
  cached = device;
  for (const listener of renameListeners) listener(device);
  return device;
}

/** Test helper: forgets the cached identity. */
export function resetDeviceForTests(): void {
  cached = null;
  loading = null;
}
