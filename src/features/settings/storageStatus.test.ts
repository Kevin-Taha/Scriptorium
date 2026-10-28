import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '@/lib/storage/persistence';
import { DB_NAME, resetDBForTests } from '@/lib/storage/db';
import { putDocument } from '@/lib/storage/repository';
import { requestPersistenceAtStartup } from './storageStatus';

vi.mock('@/lib/storage/persistence', () => ({
  getStorageStatus: vi.fn(async () => ({ persisted: false })),
  requestPersistentStorage: vi.fn(async () => true),
}));

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0';

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
}

async function wipeDatabase(): Promise<void> {
  await resetDBForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

const originalUserAgent = navigator.userAgent;

beforeEach(async () => {
  await wipeDatabase();
  vi.clearAllMocks();
});
afterEach(async () => {
  setUserAgent(originalUserAgent);
  await resetDBForTests();
});

describe('asking the browser to keep the library', () => {
  const doc = {
    id: 'a'.repeat(64),
    title: 'Book',
    fileName: 'book.pdf',
    fileSize: 1,
    pageCount: 1,
    addedAt: 0,
    lastOpenedAt: 0,
  };

  it('does nothing at launch while the library is empty', async () => {
    setUserAgent(CHROME);
    await requestPersistenceAtStartup();
    expect(requestPersistentStorage).not.toHaveBeenCalled();
  });

  it('asks at launch once there are books', async () => {
    setUserAgent(CHROME);
    await putDocument(doc);
    await requestPersistenceAtStartup();
    expect(requestPersistentStorage).toHaveBeenCalledTimes(1);
  });

  it('never surprises Firefox readers with a prompt at launch', async () => {
    setUserAgent(FIREFOX);
    await putDocument(doc);
    await requestPersistenceAtStartup();
    expect(requestPersistentStorage).not.toHaveBeenCalled();
  });
});
