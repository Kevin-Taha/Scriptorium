interface Watcher {
  observer: IntersectionObserver;
  callbacks: Map<Element, (near: boolean) => void>;
}

const watchers = new WeakMap<Element | Document, Watcher>();

/**
 * Reports when `element` comes within `marginPx` of the `root` scroller's visible
 * area (vertically). Elements sharing a root share one IntersectionObserver.
 * Returns a function that stops watching.
 */
export function observeNearViewport(
  element: Element,
  root: Element | null,
  marginPx: number,
  onChange: (near: boolean) => void,
): () => void {
  const key = root ?? document;
  let watcher = watchers.get(key);
  if (!watcher) {
    const callbacks = new Map<Element, (near: boolean) => void>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
      },
      { root, rootMargin: `${marginPx}px 0px` },
    );
    watcher = { observer, callbacks };
    watchers.set(key, watcher);
  }

  const { observer, callbacks } = watcher;
  callbacks.set(element, onChange);
  observer.observe(element);
  return () => {
    callbacks.delete(element);
    observer.unobserve(element);
    if (callbacks.size === 0) {
      observer.disconnect();
      watchers.delete(key);
    }
  };
}
