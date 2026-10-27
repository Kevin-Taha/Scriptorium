import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLaunchQueue } from './launchQueue';

const mocks = vi.hoisted(() => ({
  importPdfFile: vi.fn(),
  navigate: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock('@/features/library/importPdf', () => ({ importPdfFile: mocks.importPdfFile }));
vi.mock('@/app/router', () => ({ navigate: mocks.navigate }));
vi.mock('@/components/Toast', () => ({ showToast: mocks.showToast }));

type Consumer = (params: { files: { getFile(): Promise<File> }[] }) => void;
let consumer: Consumer;

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, 'launchQueue', {
    configurable: true,
    value: { setConsumer: (callback: Consumer) => (consumer = callback) },
  });
  startLaunchQueue();
});

afterEach(() => {
  Reflect.deleteProperty(window, 'launchQueue');
});

function handle(name: string) {
  return { getFile: async () => new File(['pdf'], name, { type: 'application/pdf' }) };
}

describe('file launches', () => {
  it('imports all files and opens the first, including existing books', async () => {
    mocks.importPdfFile
      .mockResolvedValueOnce({ doc: { id: 'existing' }, isNew: false })
      .mockResolvedValueOnce({ doc: { id: 'new' }, isNew: true });
    consumer({ files: [handle('one.pdf'), handle('two.pdf')] });
    await waitFor(() => expect(mocks.importPdfFile).toHaveBeenCalledTimes(2));
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ name: 'reader', docId: 'existing' });
  });

  it('reports individual failures and serializes subsequent launches', async () => {
    mocks.importPdfFile
      .mockRejectedValueOnce(new Error('Invalid PDF'))
      .mockResolvedValueOnce({ doc: { id: 'second' } })
      .mockResolvedValueOnce({ doc: { id: 'next-launch' } });
    consumer({ files: [handle('bad.pdf'), handle('good.pdf')] });
    consumer({ files: [handle('next.pdf')] });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(2));
    expect(mocks.showToast).toHaveBeenCalledWith('Invalid PDF', { tone: 'error' });
    expect(mocks.navigate.mock.calls).toEqual([
      [{ name: 'reader', docId: 'second' }],
      [{ name: 'reader', docId: 'next-launch' }],
    ]);
  });
});
