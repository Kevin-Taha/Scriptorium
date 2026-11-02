import { create } from 'zustand';
import type { DriveItem } from './api';

export interface DriveFolderChoice {
  id: string;
  name: string;
}

export interface DriveChooserRequest {
  /** The signed-in account, shown so the reader knows whose Drive this is. */
  account: string;
  /** Folders directly inside `parentId` (`root` is My Drive). */
  list(parentId: string): Promise<DriveItem[]>;
  choose(folder: DriveFolderChoice): void;
  cancel(): void;
}

/** The folder chooser that is open, if any. The dialog in the app shell renders it. */
export const useDriveChooserStore = create<{ request: DriveChooserRequest | null }>(() => ({
  request: null,
}));

/** Asks the reader to choose a Drive folder. Rejects with an `AbortError` if they cancel. */
export function chooseDriveFolder(options: {
  account: string;
  list(parentId: string): Promise<DriveItem[]>;
}): Promise<DriveFolderChoice> {
  useDriveChooserStore.getState().request?.cancel();
  return new Promise((resolve, reject) => {
    const close = () => useDriveChooserStore.setState({ request: null });
    useDriveChooserStore.setState({
      request: {
        ...options,
        choose: (folder) => {
          close();
          resolve(folder);
        },
        cancel: () => {
          close();
          reject(new DOMException('No folder was chosen.', 'AbortError'));
        },
      },
    });
  });
}
