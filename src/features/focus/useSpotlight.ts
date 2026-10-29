import { useEffect } from 'react';
import { useReaderStore } from '../reader/readerStore';
import { spotlightRule } from './focusLogic';

/**
 * While focus mode is on, keeps one style rule that dims every page but the one at the centre of the
 * viewport. The rule is rewritten only when the centre page changes; scrolling within a page costs a
 * comparison. Layout changes (zoom, resizing, the sidebar closing) can move the centre page without
 * moving the reading location, so the viewport and the page column are observed too.
 */
export function useSpotlight(): void {
  useEffect(() => {
    const style = document.createElement('style');
    document.head.append(style);

    let current = 0;
    const update = () => {
      const { controller, location } = useReaderStore.getState();
      const page = (controller?.getVisibleCenter() ?? location).page;
      if (page === current) return;
      current = page;
      style.textContent = spotlightRule(page);
    };
    update();

    const unsubscribe = useReaderStore.subscribe((state, previous) => {
      if (state.location !== previous.location || state.controller !== previous.controller) update();
    });
    const observer = new ResizeObserver(update);
    const viewport = document.querySelector('.reader__viewport');
    if (viewport) {
      observer.observe(viewport);
      const pages = viewport.querySelector('.reader__pages');
      if (pages) observer.observe(pages);
    }

    return () => {
      unsubscribe();
      observer.disconnect();
      style.remove();
    };
  }, []);
}
