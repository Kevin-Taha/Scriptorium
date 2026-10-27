import { useSyncExternalStore } from 'react';

export type Route =
  { name: 'library' } | { name: 'reader'; docId: string } | { name: 'review'; docId: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'read' && parts[1]) {
    return parts[2] === 'notes' ? { name: 'review', docId: parts[1] } : { name: 'reader', docId: parts[1] };
  }
  return { name: 'library' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'library':
      return '#/';
    case 'reader':
      return `#/read/${encodeURIComponent(route.docId)}`;
    case 'review':
      return `#/read/${encodeURIComponent(route.docId)}/notes`;
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeToHash(route);
  if (window.location.hash === hash) return;
  if (options.replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

let cachedHash: string | null = null;
let cachedRoute: Route = { name: 'library' };

function getSnapshot(): Route {
  const hash = window.location.hash;
  if (hash !== cachedHash) {
    cachedHash = hash;
    cachedRoute = parseHash(hash);
  }
  return cachedRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot);
}
