import type { DocId } from '@/lib/types';

/**
 * PDFs read from a Google Drive library folder, kept in the browser so opening a book again is
 * instant and works offline or before signing in again. Keyed by the book id (the SHA-256 of the
 * PDF), so a cached copy is always exactly the book it claims to be. The oldest copies are dropped
 * beyond the budget; nothing here is precious, since the PDFs stay in Drive.
 */

const CACHE_NAME = 'scriptorium-drive-books';
const KEY_PREFIX = 'https://scriptorium.invalid/drive-books/';
const SIZE_HEADER = 'x-scriptorium-size';
export const DEFAULT_BUDGET_BYTES = 1024 ** 3;

/** The slice of the Cache Storage API used here, so tests can provide a stand-in. */
export interface CacheLike {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  delete(request: string): Promise<boolean>;
  keys(): Promise<readonly { url: string }[]>;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}

function browserCaches(): CacheStorageLike | null {
  return typeof caches === 'undefined' ? null : (caches as unknown as CacheStorageLike);
}

export class BookCache {
  /** Each cached book's size, oldest first, read from the cache once and then kept up to date. */
  private sizes: Promise<Map<string, number>> | null = null;
  /** Writes run one at a time, so the sizes stay right when several books finish together. */
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: CacheStorageLike | null = browserCaches(),
    private readonly budgetBytes = DEFAULT_BUDGET_BYTES,
  ) {}

  async get(id: DocId): Promise<ArrayBuffer | null> {
    try {
      const response = await (await this.open())?.match(KEY_PREFIX + id);
      return response ? await response.arrayBuffer() : null;
    } catch (error) {
      console.warn('Scriptorium: couldn’t read a cached Drive book', error);
      return null;
    }
  }

  put(id: DocId, bytes: ArrayBuffer): Promise<void> {
    return this.serially(() => this.store(id, bytes));
  }

  clear(): Promise<void> {
    return this.serially(async () => {
      this.sizes = null;
      try {
        await this.storage?.delete(CACHE_NAME);
      } catch (error) {
        console.warn('Scriptorium: couldn’t clear cached Drive books', error);
      }
    });
  }

  private serially(task: () => Promise<void>): Promise<void> {
    const run = this.writes.then(task);
    this.writes = run.catch(() => undefined);
    return run;
  }

  private async store(id: DocId, bytes: ArrayBuffer): Promise<void> {
    if (bytes.byteLength > this.budgetBytes) return;
    try {
      const cache = await this.open();
      if (!cache) return;
      const sizes = await this.knownSizes(cache);
      const url = KEY_PREFIX + id;
      const headers = { 'Content-Type': 'application/pdf', [SIZE_HEADER]: String(bytes.byteLength) };
      await cache.put(url, new Response(bytes.slice(0), { headers }));
      sizes.delete(url);
      sizes.set(url, bytes.byteLength);
      // Drop the oldest copies until within budget.
      let total = 0;
      for (const size of sizes.values()) total += size;
      for (const [oldest, size] of sizes) {
        if (total <= this.budgetBytes) break;
        await cache.delete(oldest);
        sizes.delete(oldest);
        total -= size;
      }
    } catch (error) {
      // Full or unavailable storage only means the book downloads again next time.
      this.sizes = null;
      console.warn('Scriptorium: couldn’t keep a copy of a Drive book', error);
    }
  }

  private async open(): Promise<CacheLike | null> {
    return this.storage ? this.storage.open(CACHE_NAME) : null;
  }

  /** Sizes of what is already cached (keys come back in the order they were stored). */
  private knownSizes(cache: CacheLike): Promise<Map<string, number>> {
    this.sizes ??= (async () => {
      const sizes = new Map<string, number>();
      for (const request of await cache.keys()) {
        const response = await cache.match(request.url);
        sizes.set(request.url, Number(response?.headers.get(SIZE_HEADER)) || 0);
      }
      return sizes;
    })();
    return this.sizes;
  }
}
