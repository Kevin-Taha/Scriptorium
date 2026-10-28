import { useRef, useState } from 'react';
import { ArchiveRestore, CircleAlert, CircleCheck, Download, LoaderCircle, Upload } from 'lucide-react';
import { showToast } from '@/components/Toast';
import type { BookInfo } from '@/lib/sync/bookFile';
import { exportBackup, restoreBackup } from './backupActions';
import { bookLabel, quoted } from './format';
import { StorageSection } from './StorageSection';

const INTRO =
  'Backups include notes, highlights, bookmarks and reading progress — not the PDFs. Restoring merges; it never deletes newer notes.';
const MAX_LISTED_BOOKS = 5;

type Outcome = { tone: 'success' | 'error'; message: string; missing?: BookInfo[] };

export function BackupPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const runExport = async () => {
    setBusy('export');
    setOutcome(null);
    try {
      const result = await exportBackup();
      if (result.empty) {
        setOutcome({ tone: 'success', message: 'There’s nothing to back up yet.' });
        return;
      }
      setOutcome({ tone: 'success', message: `Saved as ${quoted(result.fileName)}.` });
      showToast(`Backup saved — ${result.summary}`);
    } catch {
      setOutcome({ tone: 'error', message: 'Couldn’t create the backup. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const runRestore = async (file: File) => {
    setBusy('restore');
    setOutcome(null);
    const result = await restoreBackup(file);
    setOutcome(
      'error' in result
        ? { tone: 'error', message: result.error }
        : { tone: 'success', message: result.message, missing: result.missing },
    );
    setBusy(null);
  };

  const missing = outcome?.missing ?? [];
  return (
    <StorageSection icon={<ArchiveRestore />} title="Backups" intro={INTRO}>
      <div className="storage-actions">
        <button type="button" className="btn" disabled={busy !== null} onClick={() => void runExport()}>
          {busy === 'export' ? (
            <LoaderCircle className="storage-spinner" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          Export backup
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
          {busy === 'restore' ? (
            <LoaderCircle className="storage-spinner" aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          Restore from backup…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Choose a backup file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void runRestore(file);
          }}
        />
      </div>
      <div className="storage-outcome" role="status">
        {outcome && (
          <div className={`storage-result storage-result--${outcome.tone}`}>
            {outcome.tone === 'error' ? (
              <CircleAlert aria-hidden="true" />
            ) : (
              <CircleCheck aria-hidden="true" />
            )}
            <div>
              <p>{outcome.message}</p>
              {missing.length > 0 && (
                <>
                  <p>Add these PDFs to see their notes:</p>
                  <ul>
                    {missing.slice(0, MAX_LISTED_BOOKS).map((book) => (
                      <li key={book.id}>{bookLabel(book)}</li>
                    ))}
                    {missing.length > MAX_LISTED_BOOKS && (
                      <li>and {missing.length - MAX_LISTED_BOOKS} more</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </StorageSection>
  );
}
