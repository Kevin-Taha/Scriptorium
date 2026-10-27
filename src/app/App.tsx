import { useEffect } from 'react';
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

  if (route.name === 'library') return <LibraryView />;
  return <ReaderScreen docId={route.docId} view={route.name} />;
}
