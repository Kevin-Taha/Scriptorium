import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/source-serif-4/wght-italic.css';
import './styles/tokens.css';
import './styles/base.css';
import './app/app.css';
import { App } from './app/App';
import { startLaunchQueue } from './app/pwa/launchQueue';
import { registerServiceWorker } from './app/pwa/registerServiceWorker';
import './app/pwa/installPrompt';
import { startFolderSync } from './features/sync/folderSync';

startLaunchQueue();
registerServiceWorker();
void startFolderSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
