/**
 * Timestamp for an edit that replaces a version stamped `previous`. Merging
 * keeps the newest stamp, so an edit must always outrank the version the
 * reader saw — even on a device whose clock runs behind the one that made it.
 */
export function nextStamp(previous = 0): number {
  return Math.max(Date.now(), previous + 1);
}
