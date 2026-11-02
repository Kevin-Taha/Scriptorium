import { DriveClient } from '../api';
import { BookCache, type CacheLike, type CacheStorageLike } from '../bookCache';
import type { DriveSession } from '../session';
import type { FakeDrive } from './fakeDrive';

/** Stands in for Google sign-in: signed in or not, with sign-in succeeding unless told otherwise. */
export class FakeAuth {
  signedIn: boolean;
  hint: string | undefined;
  authorizeCalls = 0;
  preloads = 0;
  /** What the next sign-in does instead of succeeding. */
  failWith: Error | null = null;
  /** The token Google issued at the last sign-in; it stops working if the fake Drive's token changes. */
  private issued: string;

  constructor(
    private readonly drive: FakeDrive,
    signedIn: boolean,
  ) {
    this.signedIn = signedIn;
    this.issued = drive.token;
  }

  accessToken(): string | null {
    return this.signedIn ? this.issued : null;
  }

  async authorize(): Promise<void> {
    this.authorizeCalls++;
    if (this.failWith) throw this.failWith;
    this.issued = this.drive.token;
    this.signedIn = true;
  }

  preload(): void {
    this.preloads++;
  }

  setAccountHint(email: string | undefined): void {
    this.hint = email;
  }
}

/** A Cache Storage that lives in memory, keeping keys in the order they were stored. */
export class MemoryCaches implements CacheStorageLike {
  readonly caches = new Map<string, Map<string, { bytes: ArrayBuffer; headers: Headers }>>();

  async open(name: string): Promise<CacheLike> {
    let entries = this.caches.get(name);
    if (!entries) {
      entries = new Map();
      this.caches.set(name, entries);
    }
    const store = entries;
    return {
      match: async (url) => {
        const entry = store.get(url);
        return entry ? new Response(entry.bytes.slice(0), { headers: entry.headers }) : undefined;
      },
      put: async (url, response) => {
        store.delete(url);
        store.set(url, { bytes: await response.arrayBuffer(), headers: response.headers });
      },
      delete: async (url) => store.delete(url),
      keys: async () => [...store.keys()].map((url) => ({ url })),
    };
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  /** Number of stored entries across caches. */
  get size(): number {
    return [...this.caches.values()].reduce((sum, entries) => sum + entries.size, 0);
  }
}

export interface FakeSession extends DriveSession {
  auth: FakeAuth;
  caches: MemoryCaches;
}

/** A Drive session backed by `drive`, signed in unless `signedIn` is false. */
export function fakeSession(drive: FakeDrive, { signedIn = true } = {}): FakeSession {
  const auth = new FakeAuth(drive, signedIn);
  const caches = new MemoryCaches();
  const client = new DriveClient({
    fetch: drive.fetch,
    token: () => auth.accessToken(),
    onUnauthorized: () => {
      auth.signedIn = false;
    },
    sleep: async () => {},
  });
  return { auth, client, books: new BookCache(caches), caches };
}
