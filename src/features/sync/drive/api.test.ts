import { describe, expect, it, vi } from 'vitest';
import { DriveClient, FOLDER_MIME, quote } from './api';
import { FakeDrive } from './testing/fakeDrive';

function client(drive: FakeDrive, token: () => string | null = () => drive.token) {
  const onUnauthorized = vi.fn();
  const sleep = vi.fn(async () => {});
  return {
    client: new DriveClient({ fetch: drive.fetch, token, onUnauthorized, sleep }),
    onUnauthorized,
    sleep,
  };
}

describe('DriveClient', () => {
  it('escapes quotes and backslashes in query strings', () => {
    expect(quote("O'Reilly \\ Notes")).toBe("'O\\'Reilly \\\\ Notes'");
  });

  it('lists a folder across pages, oldest first, and finds entries by exact name', async () => {
    const drive = new FakeDrive();
    drive.pageSize = 2;
    const folder = drive.mkdirs('Books');
    for (const name of ['a.pdf', 'b.pdf', "O'Reilly.pdf", 'd.pdf', 'e.pdf'])
      drive.write(`Books/${name}`, name);
    const { client: api } = client(drive);
    expect((await api.children(folder)).map((item) => item.name)).toEqual([
      'a.pdf',
      'b.pdf',
      "O'Reilly.pdf",
      'd.pdf',
      'e.pdf',
    ]);
    expect((await api.childrenNamed(folder, "O'Reilly.pdf")).map((item) => item.name)).toEqual([
      "O'Reilly.pdf",
    ]);
    expect(drive.log.filter((entry) => entry === 'GET /drive/v3/files').length).toBe(4);
  });

  it('lists only folders when choosing one, by name', async () => {
    const drive = new FakeDrive();
    drive.mkdirs('Zoology');
    drive.mkdirs('Algebra');
    drive.write('notes.pdf', 'x');
    const { client: api } = client(drive);
    const folders = await api.folders('root');
    expect(folders.map((item) => [item.name, item.mimeType])).toEqual([
      ['Algebra', FOLDER_MIME],
      ['Zoology', FOLDER_MIME],
    ]);
  });

  it('creates folders and files, replaces contents and downloads them', async () => {
    const drive = new FakeDrive();
    const { client: api } = client(drive);
    const folder = await api.createFolder('root', '.scriptorium');
    const file = await api.createFile(folder.id, 'README.txt', 'text/plain', new Blob(['first']));
    expect(drive.readText('.scriptorium/README.txt')).toBe('first');
    const updated = await api.updateFile(file.id, 'text/plain', new Blob(['second, longer']));
    expect(updated.size).toBe('14');
    expect(new TextDecoder().decode(await api.download(file.id))).toBe('second, longer');
    expect(await api.account()).toEqual(drive.account);
  });

  it('treats a missing or rejected token as needing to sign in again', async () => {
    const drive = new FakeDrive();
    const signedOut = client(drive, () => null);
    await expect(signedOut.client.children('root')).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(drive.log).toEqual([]);

    const stale = client(drive, () => 'expired-token');
    await expect(stale.client.children('root')).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(stale.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('uses the File System Access error names for missing, full and read-only', async () => {
    const drive = new FakeDrive();
    const { client: api } = client(drive);
    await expect(api.download('nope')).rejects.toMatchObject({ name: 'NotFoundError' });
    drive.failNext(() => true, 403, 'storageQuotaExceeded');
    await expect(api.createFolder('root', 'x')).rejects.toMatchObject({ name: 'QuotaExceededError' });
    drive.failNext(() => true, 403, 'insufficientFilePermissions');
    await expect(api.createFolder('root', 'x')).rejects.toMatchObject({ name: 'NoModificationAllowedError' });
  });

  it('retries rate limits and server errors, then gives up', async () => {
    const drive = new FakeDrive();
    const { client: api, sleep } = client(drive);
    drive.failNext(() => true, 429, '', 1);
    drive.failNext(() => true, 403, 'userRateLimitExceeded', 1);
    drive.failNext(() => true, 503, '', 1);
    await expect(api.children('root')).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledTimes(3);

    drive.failNext(() => true, 500, 'backendError', 10);
    await expect(api.children('root')).rejects.toThrow(/Google Drive request failed \(500, backendError\)/);
  });
});
