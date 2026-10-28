import { downloadTextFile } from '@/lib/download';
import { BackupFormatError, backupFileName, buildBackup, restoreBackupFile } from '@/lib/sync/backup';
import { countBackup, describeBackupCounts, describeRestore, type RestoreOutcome } from './format';

export type BackupExport = { empty: true } | { empty: false; fileName: string; summary: string };

/** Downloads every book's notes, highlights, bookmarks and progress as one JSON file. */
export async function exportBackup(): Promise<BackupExport> {
  const backup = await buildBackup();
  if (backup.books.length === 0) return { empty: true };
  const fileName = backupFileName(backup.exportedAt);
  downloadTextFile(fileName, JSON.stringify(backup), 'application/json');
  return { empty: false, fileName, summary: describeBackupCounts(countBackup(backup)) };
}

/** Merges a backup file into the library. Resolves to an error message when it can't. */
export async function restoreBackup(file: Blob): Promise<RestoreOutcome | { error: string }> {
  try {
    return describeRestore(await restoreBackupFile(file));
  } catch (error) {
    if (error instanceof BackupFormatError) return { error: error.message };
    return { error: 'Couldn’t restore that backup. Your library is unchanged.' };
  }
}
