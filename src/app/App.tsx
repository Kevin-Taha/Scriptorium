import { useEffect } from 'react';
import { ToastHost } from '@/components/Toast';
import { ExperimentsLab } from '@/experiments/ExperimentsLab';
import { ExperimentSlot } from '@/experiments/slots';
import { LibraryView } from '@/features/library/LibraryView';
import { ReaderScreen } from '@/features/reader/ReaderScreen';
import { LibraryStorageDialog } from '@/features/settings/LibraryStorageDialog';
import { requestPersistenceAtStartup } from '@/features/settings/storageStatus';
import { useRoute } from './router';
import { useSettingsStore } from './settingsStore';

export function App() {
  const route = useRoute();
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    void loadSettings();
    void requestPersistenceAtStartup();
  }, [loadSettings]);

  return (
    <>
      {route.name === 'library' ? <LibraryView /> : <ReaderScreen docId={route.docId} view={route.name} />}
      <LibraryStorageDialog />
      <ExperimentsLab />
      <ExperimentSlot name="App" />
      <ToastHost />
    </>
  );
}
