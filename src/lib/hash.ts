/**
 * Content-addressed identifier for a file: SHA-256 of its bytes, hex encoded.
 * Identical files map to the same id; any edit produces a new one. Falls back
 * to a fast non-cryptographic hash where Web Crypto is unavailable (insecure contexts).
 */
export async function contentHash(bytes: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return toHex(new Uint8Array(digest));
  }
  return fallbackHash(new Uint8Array(bytes));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** cyrb53-style 2×32-bit hash over all bytes, combined with the length. */
function fallbackHash(bytes: Uint8Array): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 2654435761);
    h2 = Math.imul(h2 ^ bytes[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `fnv-${hex(h2)}${hex(h1)}-${bytes.length.toString(16)}`;
}
