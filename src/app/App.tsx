import { useEffect } from 'react';
import { ToastHost } from '@/components/Toast';
import { LibraryView } from '@/features/library/LibraryView';
import { ShortcutsDialog, useHelpShortcut } from '@/features/navigation/ShortcutsDialog';
import { ReaderScreen } from '@/features/reader/ReaderScreen';
import { DriveFolderChooser } from '@/features/settings/DriveFolderChooser';
import { LibraryStorageDialog } from '@/features/settings/LibraryStorageDialog';
import { requestPersistenceAtStartup } from '@/features/settings/storageStatus';
import { useRoute } from './router';
import { useSettingsStore } from './settingsStore';

export function App() {
  const route = useRoute();
  const loadSettings = useSettingsStore((s) => s.load);
  // The reader and the review handle `?` with the rest of their keys.
  useHelpShortcut(route.name === 'library');

  useEffect(() => {
    void loadSettings();
    void requestPersistenceAtStartup();
  }, [loadSettings]);

  return (
    <>
      {route.name === 'library' ? <LibraryView /> : <ReaderScreen docId={route.docId} view={route.name} />}
      <LibraryStorageDialog />
      <DriveFolderChooser />
      <ShortcutsDialog />
      <ToastHost />
    </>
  );
}
