import { navigate } from '@/app/router';
import { showToast } from '@/components/Toast';
import { importPdfFile } from '@/features/library/importPdf';

interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

export function startLaunchQueue(): void {
  const queue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue;
  if (!queue) return;

  let pending = Promise.resolve();
  queue.setConsumer(({ files }) => {
    pending = pending.then(async () => {
      let opened = false;
      for (const handle of files) {
        try {
          const result = await importPdfFile(await handle.getFile());
          if (!opened) {
            opened = true;
            navigate({ name: 'reader', docId: result.doc.id });
          }
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : 'That file couldn’t be opened. Nothing was added.',
            { tone: 'error' },
          );
        }
      }
    });
  });
}
