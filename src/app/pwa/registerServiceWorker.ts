import { showToast } from '@/components/Toast';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) window.location.reload();
  });

  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((registration) => {
      let notified: ServiceWorker | null = null;
      const notifyUpdate = () => {
        const waiting = registration.waiting;
        if (!waiting || !navigator.serviceWorker.controller || waiting === notified) return;
        notified = waiting;
        showToast('A new version of Scriptorium is ready', {
          durationMs: 24 * 60 * 60 * 1000,
          action: {
            label: 'Reload',
            onAction: () => {
              refreshing = true;
              waiting.postMessage({ type: 'SKIP_WAITING' });
            },
          },
        });
      };
      notifyUpdate();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', notifyUpdate);
      });
    })
    .catch((error: unknown) => {
      console.error('Could not register the offline service worker', error);
    });
}
