import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriveItem } from '@/features/sync/drive/api';
import { chooseDriveFolder, useDriveChooserStore } from '@/features/sync/drive/chooser';
import { DriveFolderChooser } from './DriveFolderChooser';

const folderItem = (id: string, name: string): DriveItem => ({
  id,
  name,
  mimeType: 'application/vnd.google-apps.folder',
  modifiedTime: '2026-01-01T00:00:00Z',
});

const tree: Record<string, DriveItem[]> = {
  root: [folderItem('books', 'Books'), folderItem('photos', 'Photos')],
  books: [folderItem('physics', 'Physics')],
  physics: [],
};

function open(list: (parentId: string) => Promise<DriveItem[]> = async (id) => tree[id] ?? []) {
  render(<DriveFolderChooser />);
  let choice!: ReturnType<typeof chooseDriveFolder>;
  act(() => {
    choice = chooseDriveFolder({ account: 'reader@example.com', list });
  });
  // Tests that don't choose leave it to be cancelled on cleanup.
  choice.catch(() => {});
  return { choice, dialog: screen.getByRole('dialog', { name: 'Choose a Google Drive folder' }) };
}

afterEach(() => {
  act(() => useDriveChooserStore.getState().request?.cancel());
  cleanup();
});

describe('Drive folder chooser', () => {
  it('browses from My Drive and chooses the open folder', async () => {
    const list = vi.fn(async (id: string) => tree[id] ?? []);
    const { choice, dialog } = open(list);
    expect(within(dialog).getByText(/Signed in as reader@example\.com\./)).toBeTruthy();
    const use = () => within(dialog).getAllByRole('button').at(-1) as HTMLButtonElement;
    expect(use().textContent).toBe('Open a folder to use it');
    expect(use().disabled).toBe(true);

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Books' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Physics' }));
    expect(await within(dialog).findByText('No folders inside this one.')).toBeTruthy();
    expect(list.mock.calls.map(([id]) => id)).toEqual(['root', 'books', 'physics']);
    const location = within(dialog).getByRole('navigation', { name: 'Folder location' });
    expect(
      within(location)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['My Drive', 'Books', 'Physics']);

    fireEvent.click(within(location).getByRole('button', { name: 'Books' }));
    expect(await within(dialog).findByRole('button', { name: 'Physics' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use “Books”' }));
    await expect(choice).resolves.toEqual({ id: 'books', name: 'Books' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancels with an AbortError', async () => {
    const { choice, dialog } = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await expect(choice).rejects.toMatchObject({ name: 'AbortError' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('explains a failed listing and tries again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = vi
      .fn<(id: string) => Promise<DriveItem[]>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new DOMException('Signed out', 'NotAllowedError'))
      .mockResolvedValue(tree.root);
    const { dialog } = open(list);
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Check your connection/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Google signed Scriptorium out/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Books' })).toBeTruthy());
    warn.mockRestore();
  });
});
