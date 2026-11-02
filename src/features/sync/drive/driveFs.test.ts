import { afterEach, describe, expect, it } from 'vitest';
import { useDriveChooserStore } from './chooser';
import { DriveDirectoryHandle, isDriveFolder, openDriveFolder, pickDriveFolder } from './driveFs';
import { FakeDrive, FOLDER } from './testing/fakeDrive';
import { fakeSession } from './testing/fakeSession';

function library(drive = new FakeDrive()) {
  const id = drive.mkdirs('Textbooks');
  const session = fakeSession(drive);
  return { drive, session, root: new DriveDirectoryHandle(session, id, 'Textbooks', 'reader@example.com') };
}

async function names(dir: DriveDirectoryHandle): Promise<string[]> {
  const result: string[] = [];
  for await (const entry of dir.values()) result.push(`${entry.kind}:${entry.name}`);
  return result;
}

afterEach(() => useDriveChooserStore.getState().request?.cancel());

describe('Drive folder handles', () => {
  it('list files and folders, skipping Google Docs, odd names and later duplicates', async () => {
    const { drive, root } = library();
    drive.write('Textbooks/Mechanics.pdf', '%PDF mechanics');
    drive.write('Textbooks/Physics/Optics.pdf', '%PDF optics');
    const parent = drive.find('Textbooks')!.id;
    drive.add(parent, 'Reading list', 'application/vnd.google-apps.document');
    drive.add(parent, 'a/b.pdf', 'application/pdf', '%PDF');
    const second = drive.add(parent, 'Physics', FOLDER);
    drive.add(second.id, 'Hidden.pdf', 'application/pdf', '%PDF');

    expect(await names(root)).toEqual(['file:Mechanics.pdf', 'directory:Physics']);
    const physics = await root.getDirectoryHandle('Physics');
    expect(await names(physics)).toEqual(['file:Optics.pdf']);

    const file = await (await root.getFileHandle('Mechanics.pdf')).getFile();
    expect(file.size).toBe(14);
    expect(file.lastModified).toBe(Date.parse(drive.find('Textbooks/Mechanics.pdf')!.modifiedTime));
    expect(await file.text()).toBe('%PDF mechanics');
  });

  it('report missing entries and the wrong kind like the File System Access API', async () => {
    const { drive, root } = library();
    drive.write('Textbooks/Mechanics.pdf', '%PDF');
    await expect(root.getDirectoryHandle('Nope')).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(root.getFileHandle('Nope.pdf')).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(root.getDirectoryHandle('Mechanics.pdf')).rejects.toMatchObject({
      name: 'TypeMismatchError',
    });
    drive.mkdirs('Textbooks/Physics');
    await expect(root.getFileHandle('Physics')).rejects.toMatchObject({ name: 'TypeMismatchError' });
  });

  it('create folders on request and a file with its first write, then replace it in place', async () => {
    const { drive, root } = library();
    const sync = await root.getDirectoryHandle('.scriptorium', { create: true });
    expect((await root.getDirectoryHandle('.scriptorium', { create: true })).id).toBe(sync.id);

    const handle = await sync.getFileHandle('README.txt', { create: true });
    expect(drive.find('Textbooks/.scriptorium/README.txt')).toBeUndefined();
    expect((await handle.getFile()).size).toBe(0);

    for (const text of ['first', 'second']) {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    }
    expect(drive.names('Textbooks/.scriptorium')).toEqual(['README.txt']);
    expect(drive.readText('Textbooks/.scriptorium/README.txt')).toBe('second');
    expect(drive.find('Textbooks/.scriptorium/README.txt')!.mimeType).toBe('text/plain');
    expect(await (await handle.getFile()).text()).toBe('second');
  });

  it('settle on the oldest of two folders with the same name', async () => {
    const { drive, root } = library();
    const parent = drive.find('Textbooks')!.id;
    const first = drive.add(parent, '.scriptorium', FOLDER);
    drive.add(parent, '.scriptorium', FOLDER);
    expect((await root.getDirectoryHandle('.scriptorium', { create: true })).id).toBe(first.id);
  });

  it('are granted while signed in and sign in again when asked', async () => {
    const { root, session } = library();
    expect(await root.queryPermission()).toBe('granted');
    session.auth.signedIn = false;
    expect(await root.queryPermission()).toBe('prompt');
    expect(await root.requestPermission()).toBe('granted');
    expect(session.auth.authorizeCalls).toBe(1);

    session.auth.signedIn = false;
    session.auth.failWith = new Error('Google sign-in was closed before it finished.');
    expect(await root.requestPermission()).toBe('prompt');
  });

  it('compare by Drive id and remember the folder and account', async () => {
    const { root, session } = library();
    expect(await root.isSameEntry(new DriveDirectoryHandle(session, root.id, 'Renamed'))).toBe(true);
    expect(await root.isSameEntry(new DriveDirectoryHandle(session, 'other', 'Textbooks'))).toBe(false);
    expect(root.ref()).toEqual({ id: root.id, name: 'Textbooks', account: 'reader@example.com' });

    const reopened = openDriveFolder(root.ref(), session);
    expect(isDriveFolder(reopened)).toBe(true);
    expect(reopened.id).toBe(root.id);
    expect(session.auth.hint).toBe('reader@example.com');
    expect(session.auth.preloads).toBe(1);
  });

  it('let the reader sign in and choose a folder', async () => {
    const drive = new FakeDrive();
    const books = drive.mkdirs('Books');
    const session = fakeSession(drive, { signedIn: false });
    const picked = pickDriveFolder(session);
    await expect.poll(() => useDriveChooserStore.getState().request).not.toBeNull();
    const request = useDriveChooserStore.getState().request!;
    expect(session.auth.authorizeCalls).toBe(1);
    expect(request.account).toBe('reader@example.com');
    expect((await request.list('root')).map((item) => item.name)).toEqual(['Books']);
    request.choose({ id: books, name: 'Books' });
    const folder = await picked;
    expect(folder.ref()).toEqual({ id: books, name: 'Books', account: 'reader@example.com' });
    expect(session.auth.hint).toBe('reader@example.com');
    expect(useDriveChooserStore.getState().request).toBeNull();
  });

  it('reject with an AbortError when the reader cancels choosing', async () => {
    const session = fakeSession(new FakeDrive());
    const picked = pickDriveFolder(session);
    await expect.poll(() => useDriveChooserStore.getState().request).not.toBeNull();
    useDriveChooserStore.getState().request!.cancel();
    await expect(picked).rejects.toMatchObject({ name: 'AbortError' });
  });
});
