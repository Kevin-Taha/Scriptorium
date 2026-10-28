import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, resetDBForTests } from '../storage/db';
import { getBookData, listNotes, putDocument, putNote } from '../storage/repository';
import type { LibraryDocument, MarginNote } from '../types';
import { onBookDataMerged } from './apply';
import {
  BackupFormatError,
  backupFileName,
  buildBackup,
  parseBackup,
  restoreBackup,
  restoreBackupFile,
} from './backup';
import { resetDeviceForTests } from './device';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const doc = (id: string): LibraryDocument => ({
  id,
  title: `Book ${id[0]}`,
  fileName: `${id[0]}.pdf`,
  fileSize: 1,
  pageCount: 10,
  addedAt: 0,
  lastOpenedAt: 0,
});

const note = (id: string, docId: string, updatedAt: number, text = id): MarginNote => ({
  id,
  docId,
  page: 1,
  y: 0.2,
  text,
  color: 'amber',
  createdAt: 0,
  updatedAt,
});

async function wipe(): Promise<void> {
  await resetDBForTests();
  resetDeviceForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

beforeEach(wipe);
afterEach(resetDBForTests);

describe('library backups', () => {
  it('restores every annotation into an empty browser', async () => {
    await putDocument(doc(A));
    await putNote(note('n1', A, 1));
    await putNote(note('n2', B, 1));
    const backup = JSON.parse(JSON.stringify(await buildBackup(1000)));

    await wipe();
    await putDocument(doc(A));
    const summary = await restoreBackup(parseBackup(backup));

    expect(summary).toEqual({
      books: 2,
      updated: 2,
      missing: [{ id: B, title: 'Untitled', fileName: '', pageCount: 0 }],
    });
    expect((await listNotes(A)).map((n) => n.id)).toEqual(['n1']);
    // Notes for a book without its PDF wait for the PDF to be added.
    expect((await listNotes(B)).map((n) => n.id)).toEqual(['n2']);
  });

  it('merges instead of overwriting, so newer local edits survive', async () => {
    await putNote(note('n1', A, 1, 'old'));
    const backup = await buildBackup();
    await putNote(note('n1', A, 5, 'new'));
    await putNote(note('n3', A, 5));

    const summary = await restoreBackup(backup);
    expect(summary.updated).toBe(0);
    expect((await listNotes(A)).map((n) => n.text)).toEqual(['new', 'n3']);
  });

  it('tells open views which books changed', async () => {
    const backup = parseBackup({
      format: 'scriptorium.backup',
      version: 1,
      books: [{ book: { id: A }, data: { notes: [note('n1', A, 1)] } }],
    });
    const seen: string[] = [];
    const stop = onBookDataMerged((docId, data) => seen.push(`${docId.slice(0, 1)}:${data.notes.length}`));
    await restoreBackup(backup);
    await restoreBackup(backup);
    stop();
    expect(seen).toEqual(['a:1']);
  });

  it('rejects files that are not Scriptorium backups', async () => {
    await expect(restoreBackupFile(new Blob(['not json']))).rejects.toBeInstanceOf(BackupFormatError);
    expect(() => parseBackup({ format: 'scriptorium.backup', version: 99, books: [] })).toThrow(
      /newer version/,
    );
    expect(() => parseBackup({ format: 'other', books: [] })).toThrow(BackupFormatError);
  });

  it('restores from a file', async () => {
    await putNote(note('n1', A, 1));
    const blob = new Blob([JSON.stringify(await buildBackup())], { type: 'application/json' });
    await wipe();
    await restoreBackupFile(blob);
    expect((await getBookData(A)).notes).toHaveLength(1);
  });

  it('names files by date', () => {
    expect(backupFileName(new Date(2026, 9, 5).getTime())).toBe('Scriptorium backup 2026-10-05.json');
  });
});
