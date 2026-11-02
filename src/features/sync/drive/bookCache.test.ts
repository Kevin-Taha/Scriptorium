import { describe, expect, it, vi } from 'vitest';
import { BookCache } from './bookCache';
import { MemoryCaches } from './testing/fakeSession';

const bytes = (size: number, fill = 1) => new Uint8Array(size).fill(fill).buffer;
const id = (n: number) => String(n).repeat(64).slice(0, 64);

describe('BookCache', () => {
  it('keeps books by id and gives back exactly what was stored', async () => {
    const cache = new BookCache(new MemoryCaches());
    expect(await cache.get(id(1))).toBeNull();
    await cache.put(id(1), bytes(10, 7));
    expect(new Uint8Array((await cache.get(id(1)))!)).toEqual(new Uint8Array(10).fill(7));
  });

  it('drops the oldest books beyond its budget, and skips books larger than it', async () => {
    const caches = new MemoryCaches();
    const cache = new BookCache(caches, 25);
    await cache.put(id(1), bytes(10));
    await cache.put(id(2), bytes(10));
    await cache.put(id(3), bytes(10));
    expect(await cache.get(id(1))).toBeNull();
    expect(await cache.get(id(2))).not.toBeNull();
    expect(await cache.get(id(3))).not.toBeNull();
    await cache.put(id(4), bytes(26));
    expect(await cache.get(id(4))).toBeNull();
    expect(caches.size).toBe(2);
  });

  it('reads the sizes of earlier copies once, not on every save', async () => {
    const caches = new MemoryCaches();
    await new BookCache(caches).put(id(1), bytes(10));
    await new BookCache(caches).put(id(2), bytes(10));

    const open = caches.open.bind(caches);
    let matches = 0;
    vi.spyOn(caches, 'open').mockImplementation(async (name) => {
      const cache = await open(name);
      return {
        ...cache,
        match: (url) => {
          matches++;
          return cache.match(url);
        },
      };
    });
    // A new session knows nothing yet, and still keeps to its budget with what is already there.
    const cache = new BookCache(caches, 25);
    await cache.put(id(3), bytes(10));
    expect(matches).toBe(2);
    await cache.put(id(4), bytes(10));
    await cache.put(id(5), bytes(10));
    expect(matches).toBe(2);
    expect(await cache.get(id(3))).toBeNull();
    expect(await cache.get(id(5))).not.toBeNull();
    expect(caches.size).toBe(2);
  });

  it('stays within budget when several books are saved at once', async () => {
    const caches = new MemoryCaches();
    const cache = new BookCache(caches, 25);
    await Promise.all([1, 2, 3, 4].map((n) => cache.put(id(n), bytes(10))));
    expect(caches.size).toBe(2);
    expect(await cache.get(id(4))).not.toBeNull();
  });

  it('clears everything when the folder is unlinked', async () => {
    const caches = new MemoryCaches();
    const cache = new BookCache(caches);
    await cache.put(id(1), bytes(4));
    await cache.clear();
    expect(await cache.get(id(1))).toBeNull();
  });

  it('does nothing where Cache Storage is unavailable or failing', async () => {
    const offline = new BookCache(null);
    await offline.put(id(1), bytes(4));
    expect(await offline.get(id(1))).toBeNull();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = new BookCache({
      open: async () => {
        throw new DOMException('Full', 'QuotaExceededError');
      },
      delete: async () => false,
    });
    await expect(broken.put(id(1), bytes(4))).resolves.toBeUndefined();
    expect(await broken.get(id(1))).toBeNull();
    warn.mockRestore();
  });
});
