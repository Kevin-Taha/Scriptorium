import { useSyncExternalStore } from 'react';
import { MonitorDown } from 'lucide-react';
import { isInstallable, promptInstall, subscribeToInstallPrompt } from './installPrompt';

export function InstallButton() {
  const installable = useSyncExternalStore(subscribeToInstallPrompt, isInstallable);
  if (!installable) return null;

  return (
    <button className="btn btn--ghost btn--sm" onClick={() => void promptInstall()}>
      <MonitorDown aria-hidden="true" />
      Install app
    </button>
  );
}
