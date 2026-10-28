import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/components/Toast';
import { useStorageDialogStore } from '@/features/settings/storageDialogStore';
import { useSyncStore } from '@/features/sync/syncStore';
import { FolderStatusChip } from './FolderStatusChip';

vi.mock('@/lib/storage/persistence', () => ({
  getStorageStatus: vi.fn(async () => ({ persisted: true })),
  requestPersistentStorage: vi.fn(async () => true),
}));

const folder = { name: 'Textbooks', linkedAt: 0 };

function setSync(state: Partial<ReturnType<typeof useSyncStore.getState>>) {
  act(() => useSyncStore.setState(state));
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  useStorageDialogStore.setState({ open: false });
  useSyncStore.setState({
    status: 'unlinked',
    folder: null,
    lastSyncedAt: null,
    error: null,
    progress: null,
    devices: [],
    reconnect: vi.fn(async () => {}),
  });
});
afterEach(cleanup);

describe('FolderStatusChip', () => {
  it.each(['unsupported', 'unlinked'] as const)('is absent while %s', (status) => {
    setSync({ status, folder: null });
    const { container } = render(<FolderStatusChip />);
    expect(container.textContent).toBe('');
  });

  it('shows the folder and when it last synced, and opens Library & storage', () => {
    setSync({ status: 'idle', folder, lastSyncedAt: Date.now() - 2 * 60_000 });
    render(<FolderStatusChip />);
    const chip = screen.getByRole('button', { name: 'Textbooks · synced 2 minutes ago' });
    fireEvent.click(chip);
    expect(useStorageDialogStore.getState().open).toBe(true);
  });

  it('shows progress while books are added', () => {
    setSync({ status: 'syncing', folder, progress: { label: 'Adding books', done: 3, total: 12 } });
    render(<FolderStatusChip />);
    expect(screen.getByRole('button', { name: 'Adding books 3 / 12' })).toBeTruthy();
  });

  it('falls back to a plain message when progress is unknown', () => {
    setSync({ status: 'syncing', folder, progress: null });
    render(<FolderStatusChip />);
    expect(screen.getByRole('button', { name: 'Syncing “Textbooks”…' })).toBeTruthy();
  });

  it('flags a sync problem and opens the dialog for details', () => {
    setSync({ status: 'error', folder, error: 'Nope' });
    render(<FolderStatusChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Couldn’t sync “Textbooks”' }));
    expect(useStorageDialogStore.getState().open).toBe(true);
  });

  it('reconnects in place when the browser needs permission again', async () => {
    const reconnect = vi.fn(async () => {});
    setSync({ status: 'needs-permission', folder, reconnect });
    render(<FolderStatusChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect “Textbooks”' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(useStorageDialogStore.getState().open).toBe(false);
    await vi.waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false));
  });

  it('reports a failed reconnect', async () => {
    setSync({
      status: 'needs-permission',
      folder,
      reconnect: vi.fn(async () => {
        throw new Error('Access to “Textbooks” was denied.');
      }),
    });
    render(<FolderStatusChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect “Textbooks”' }));
    await vi.waitFor(() =>
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
        'Access to “Textbooks” was denied.',
      ]),
    );
  });

  it('announces state changes in a live region without the progress counts', () => {
    setSync({ status: 'syncing', folder, progress: { label: 'Adding books', done: 1, total: 12 } });
    render(<FolderStatusChip />);
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('Syncing “Textbooks”');
    setSync({ progress: { label: 'Adding books', done: 2, total: 12 } });
    expect(live.textContent).toBe('Syncing “Textbooks”');
    setSync({ status: 'idle', lastSyncedAt: Date.now() });
    expect(live.textContent).toBe('“Textbooks” is up to date');
  });
});
