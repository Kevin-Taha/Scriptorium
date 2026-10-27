import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface WorkerEvent {
  request: { method: string; url: string; mode: string };
  respondWith(response: Promise<unknown>): void;
  waitUntil(response: Promise<unknown>): void;
  data?: { type: string };
}

let handlers: Record<string, (event: WorkerEvent) => void>;
const cache = { addAll: vi.fn(), match: vi.fn() };
const caches = { open: vi.fn(), keys: vi.fn(), delete: vi.fn() };
const claim = vi.fn();
const skipWaiting = vi.fn();
const fetch = vi.fn();

class PrecacheRequest {
  url: string;
  cache: string;

  constructor(url: URL, options: { cache: string }) {
    this.url = url.href;
    this.cache = options.cache;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  handlers = {};
  cache.addAll.mockResolvedValue(undefined);
  cache.match.mockResolvedValue('cached response');
  caches.open.mockResolvedValue(cache);
  caches.keys.mockResolvedValue([]);
  caches.delete.mockResolvedValue(true);
  claim.mockResolvedValue(undefined);
  skipWaiting.mockResolvedValue(undefined);
  fetch.mockResolvedValue('network response');
  const source = readFileSync('src/app/pwa/service-worker.js', 'utf8')
    .replace('__PRECACHE_URLS__', '["./index.html","./assets/app.js"]')
    .replace('__CACHE_VERSION__', 'test-version');
  runInNewContext(source, {
    URL,
    Request: PrecacheRequest,
    caches,
    fetch,
    self: {
      registration: { scope: 'https://example.test/books/' },
      clients: { claim },
      skipWaiting,
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) => {
        handlers[type] = handler;
      },
    },
  });
});

function workerEvent(request: Partial<WorkerEvent['request']> = {}): WorkerEvent {
  return {
    request: { method: 'GET', url: 'https://example.test/books/assets/app.js', mode: 'cors', ...request },
    respondWith: vi.fn(),
    waitUntil: vi.fn(),
  };
}

describe('offline service worker', () => {
  it('pre-caches assets before installation and waits for an explicit update message', async () => {
    const event = workerEvent();
    handlers.install(event);
    await vi.mocked(event.waitUntil).mock.calls[0][0];
    const requests = cache.addAll.mock.calls[0][0] as PrecacheRequest[];
    expect(requests.map((request) => [request.url, request.cache])).toEqual([
      ['https://example.test/books/index.html', 'reload'],
      ['https://example.test/books/assets/app.js', 'reload'],
    ]);
    expect(skipWaiting).not.toHaveBeenCalled();
    handlers.message({ ...event, data: { type: 'SKIP_WAITING' } });
    expect(skipWaiting).toHaveBeenCalledOnce();
  });

  it('discards an incomplete cache if precaching fails', async () => {
    cache.addAll.mockRejectedValueOnce(new Error('offline'));
    const event = workerEvent();
    handlers.install(event);
    await expect(vi.mocked(event.waitUntil).mock.calls[0][0]).rejects.toThrow('offline');
    expect(caches.delete).toHaveBeenCalledWith(
      'scriptorium-precache:https://example.test/books/:test-version',
    );
    expect(skipWaiting).not.toHaveBeenCalled();
  });

  it('matches static assets regardless of Origin Vary and falls back to the network', async () => {
    const event = workerEvent();
    handlers.fetch(event);
    expect(await vi.mocked(event.respondWith).mock.calls[0][0]).toBe('cached response');
    expect(cache.match).toHaveBeenCalledWith(event.request, { ignoreVary: true });

    cache.match.mockResolvedValueOnce(undefined);
    const missing = workerEvent({ url: 'https://example.test/books/other' });
    handlers.fetch(missing);
    expect(await vi.mocked(missing.respondWith).mock.calls[0][0]).toBe('network response');
    expect(fetch).toHaveBeenCalledWith(missing.request);
  });

  it('serves the shell for scoped navigation and ignores other origins, paths, and methods', async () => {
    const navigation = workerEvent({ url: 'https://example.test/books/?open=1', mode: 'navigate' });
    handlers.fetch(navigation);
    await vi.mocked(navigation.respondWith).mock.calls[0][0];
    expect(cache.match).toHaveBeenCalledWith(new URL('https://example.test/books/index.html'), {
      ignoreVary: true,
    });
    for (const request of [
      { url: 'https://another.test/books/' },
      { url: 'https://example.test/other/' },
      { url: 'https://example.test/books/other-app/', mode: 'navigate' },
      { method: 'POST' },
    ]) {
      const event = workerEvent(request);
      handlers.fetch(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    }
  });

  it('keeps the previous build for older tabs and cleans up only older caches in this scope', async () => {
    caches.keys.mockResolvedValue([
      'scriptorium-precache:https://example.test/books/:old',
      'scriptorium-precache:https://example.test/books/:previous',
      'scriptorium-precache:https://example.test/books/:test-version',
      'scriptorium-precache:https://example.test/other/:old',
    ]);
    const event = workerEvent();
    handlers.activate(event);
    await vi.mocked(event.waitUntil).mock.calls[0][0];
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith(
      'scriptorium-precache:https://example.test/books/:old',
    );
    expect(claim).toHaveBeenCalledOnce();
  });

  it('serves older hashed assets from the previous cache for an existing tab', async () => {
    const previousCache = { match: vi.fn().mockResolvedValue('previous response') };
    cache.match.mockResolvedValue(undefined);
    caches.keys.mockResolvedValue(['scriptorium-precache:https://example.test/books/:previous']);
    caches.open.mockResolvedValueOnce(cache).mockResolvedValueOnce(previousCache);
    const event = workerEvent();
    handlers.fetch(event);
    expect(await vi.mocked(event.respondWith).mock.calls[0][0]).toBe('previous response');
    expect(previousCache.match).toHaveBeenCalledWith(event.request, { ignoreVary: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
