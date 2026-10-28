import { describe, expect, it } from 'vitest';
import { scanDeviceFiles, scanPdfs } from './scan';
import { MemoryDirectoryHandle, writeFile } from './testing/memoryFs';

const ID = 'ab'.repeat(32);

describe('scanPdfs', () => {
  it('finds PDFs recursively, skipping hidden and junk folders', async () => {
    const root = new MemoryDirectoryHandle('Textbooks');
    for (const path of [
      'Mechanics.pdf',
      'Physics/Optics.PDF',
      'Physics/Year 2/Waves.pdf',
      'Physics/notes.txt',
      '.scriptorium/devices/x/book.pdf',
      '.Trash/Old.pdf',
      'node_modules/pkg/doc.pdf',
      '._Mechanics.pdf',
    ]) {
      await writeFile(root, path, `%PDF ${path}`);
    }
    const { pdfs, truncated } = await scanPdfs(root);
    expect(truncated).toBe(false);
    expect(pdfs.map((p) => p.path)).toEqual([
      'Mechanics.pdf',
      'Physics/Optics.PDF',
      'Physics/Year 2/Waves.pdf',
    ]);
    expect(pdfs[0].size).toBe('%PDF Mechanics.pdf'.length);
    expect(pdfs[0].lastModified).toBeGreaterThan(0);
  });

  it('stops at the depth and size limits', async () => {
    const root = new MemoryDirectoryHandle('Deep');
    await writeFile(root, 'a/b/c/Deep.pdf', '%PDF');
    await writeFile(root, 'a/Shallow.pdf', '%PDF');
    const depthLimited = await scanPdfs(root, { maxDepth: 2, maxEntries: 100, maxPdfs: 100 });
    expect(depthLimited.pdfs.map((p) => p.path)).toEqual(['a/Shallow.pdf']);

    const countLimited = await scanPdfs(root, { maxDepth: 8, maxEntries: 100, maxPdfs: 1 });
    expect(countLimited.pdfs).toHaveLength(1);
    expect(countLimited.truncated).toBe(true);

    const entryLimited = await scanPdfs(root, { maxDepth: 8, maxEntries: 2, maxPdfs: 100 });
    expect(entryLimited.truncated).toBe(true);
  });
});

describe('scanDeviceFiles', () => {
  it('lists book files per device and ignores everything else', async () => {
    const sync = new MemoryDirectoryHandle('.scriptorium');
    await writeFile(sync, 'README.txt', 'hello');
    await writeFile(sync, `devices/laptop/${ID}.json`, '{}');
    await writeFile(sync, `devices/laptop/${ID}.json.crswap`, '{}');
    await writeFile(sync, 'devices/laptop/notes.json', '{}');
    await writeFile(sync, `devices/.hidden/${ID}.json`, '{}');
    await writeFile(sync, `devices/phone/${ID}.json`, '{"x":1}');
    const entries = await scanDeviceFiles(sync);
    expect(entries.map((e) => [e.deviceId, e.bookId, e.path])).toEqual([
      ['laptop', ID, `laptop/${ID}.json`],
      ['phone', ID, `phone/${ID}.json`],
    ]);
    expect(entries[1].size).toBe(7);
  });

  it('returns nothing when no device has written yet', async () => {
    expect(await scanDeviceFiles(new MemoryDirectoryHandle('.scriptorium'))).toEqual([]);
  });
});
