import { useEffect } from 'react';
import { HIDE_DELAY_MS, REVEAL_ZONE, shouldReveal } from './focusLogic';

/** On `<html>` while the pointer has brought the toolbar back over the page. */
const REVEALED_CLASS = 'focus-toolbar';

/**
 * While focus mode is on, brings the toolbar back when the pointer reaches the top edge (or a tap lands
 * there) and lets it go shortly after the pointer leaves. Keyboard focus and open menus keep it in view
 * through CSS (focus.css), so no bookkeeping is needed for those.
 */
export function useToolbarReveal(): void {
  useEffect(() => {
    const root = document.documentElement;
    // Entering with the pointer on the toolbar (a click on its button) must not bring it straight back.
    let armed = !document.querySelector('.reader__toolbar')?.matches(':hover');
    let shown = false;
    let timer = 0;

    const setShown = (on: boolean) => {
      shown = on;
      root.classList.toggle(REVEALED_CLASS, on);
    };
    const hideSoon = () => {
      if (!shown || timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        setShown(false);
      }, HIDE_DELAY_MS);
    };
    const onMove = (event: PointerEvent) => {
      if (event.clientY > REVEAL_ZONE) armed = true;
      if (shouldReveal(event.clientY, armed)) {
        window.clearTimeout(timer);
        timer = 0;
        setShown(true);
      } else hideSoon();
    };
    // A tap is deliberate, so it needs no arming.
    const onDown = (event: PointerEvent) => {
      armed = true;
      onMove(event);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    root.addEventListener('mouseleave', hideSoon);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      root.removeEventListener('mouseleave', hideSoon);
      root.classList.remove(REVEALED_CLASS);
    };
  }, []);
}
