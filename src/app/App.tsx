import { useEffect } from 'react';
import { ToastHost } from '@/components/Toast';
import { LibraryView } from '@/features/library/LibraryView';
import { ReaderScreen } from '@/features/reader/ReaderScreen';
import { useRoute } from './router';
import { useSettingsStore } from './settingsStore';

export function App() {
  const route = useRoute();
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <>
      {route.name === 'library' ? (
        <LibraryView />
      ) : (
        <ReaderScreen docId={route.docId} view={route.name} />
      )}
      <ToastHost />
    </>
  );
}
