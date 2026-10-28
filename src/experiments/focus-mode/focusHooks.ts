import { useEffect, useRef } from 'react';
import { useReaderStore } from '@/features/reader/readerStore';
import { isEditableTarget } from '@/lib/util';
import { EXPERIMENT_EVENTS, useExperimentEvent } from '../shared/events';
import { HIDE_DELAY_MS, REVEAL_ZONE, shouldReveal, spotlightCss } from './focusLogic';
import { CHROME_CLASS, useFocusStore } from './focusStore';

/** F toggles focus mode, Shift+F the reading ruler, Esc leaves. */
export function useFocusShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector('dialog:modal')) return;
      const store = useFocusStore.getState();
      // Other handlers (the Return pill) also consume Esc and mark it handled, so it is not checked here.
      if (event.key === 'Escape') {
        if (store.active) store.exit();
        return;
      }
      if (event.key.toLowerCase() !== 'f' || event.defaultPrevented || event.repeat) return;
      event.preventDefault();
      if (!event.shiftKey) store.toggle();
      else if (store.active) store.toggleRuler();
      else {
        store.setRuler(true);
        store.enter();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** The command palette's "Toggle focus mode". */
export function useFocusEvent(): void {
  useExperimentEvent(EXPERIMENT_EVENTS.toggleFocus, () => useFocusStore.getState().toggle());
}

/** Leaving the reader or switching the experiment off must put everything back. */
export function useFocusCleanup(): void {
  useEffect(() => () => useFocusStore.getState().exit(), []);
}

/**
 * Brings the toolbar back over the page while the pointer is in the top strip, hides it shortly after
 * the pointer leaves. Keyboard focus inside the toolbar is handled in CSS (`:has(:focus-visible)`).
 */
export function useChromeReveal(active: boolean): void {
  const lastY = useRef(Number.POSITIVE_INFINITY);

  // Tracked even outside focus mode, so entering with the pointer already at the top doesn't bounce the toolbar back.
  useEffect(() => {
    const track = (event: PointerEvent) => {
      lastY.current = event.clientY;
    };
    window.addEventListener('pointermove', track, { passive: true });
    return () => window.removeEventListener('pointermove', track);
  }, []);

  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    let armed = lastY.current > REVEAL_ZONE;
    let timer = 0;

    const toolbar = () => document.querySelector<HTMLElement>('.reader__toolbar');
    const setRevealed = (on: boolean) => root.classList.toggle(CHROME_CLASS, on);
    const stays = () => {
      const element = toolbar();
      return (
        !!element &&
        (element.matches(':hover') ||
          element.matches(':has(:focus-visible)') ||
          !!element.querySelector('[aria-expanded="true"]'))
      );
    };
    const scheduleHide = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!stays()) setRevealed(false);
      }, HIDE_DELAY_MS);
    };
    const reveal = () => {
      window.clearTimeout(timer);
      setRevealed(true);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (event.clientY > REVEAL_ZONE) armed = true;
      if (shouldReveal(event.clientY, armed)) reveal();
      else if (root.classList.contains(CHROME_CLASS)) scheduleHide();
    };
    // Touch has no hover: a tap in the top strip reveals the toolbar.
    const onDown = (event: PointerEvent) => {
      if (event.clientY <= REVEAL_ZONE) reveal();
      else if (root.classList.contains(CHROME_CLASS)) scheduleHide();
    };
    const onLeave = () => scheduleHide();
    const onFocusOut = () => {
      if (root.classList.contains(CHROME_CLASS)) scheduleHide();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    root.addEventListener('mouseleave', onLeave);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      root.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('focusout', onFocusOut);
      setRevealed(false);
    };
  }, [active]);
}

/** Dims every page except the one at the centre of the viewport, via a small `<style>` element. */
export function useSpotlight(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const style = document.createElement('style');
    style.dataset.focusSpotlight = '';
    document.head.append(style);

    let current = -1;
    const update = () => {
      const { controller, location } = useReaderStore.getState();
      const page = (controller?.getVisibleCenter() ?? location).page;
      if (page === current) return;
      current = page;
      style.textContent = spotlightCss(page);
    };
    update();

    // Layout changes (toolbar, sidebar, fit-width rescale) can move the centre page without moving the location.
    const timers: number[] = [];
    const settle = () => {
      requestAnimationFrame(() => requestAnimationFrame(update));
      for (const ms of [160, 400]) timers.push(window.setTimeout(update, ms));
    };
    settle();

    const unsubscribe = useReaderStore.subscribe((state, previous) => {
      if (state.location !== previous.location || state.controller !== previous.controller) update();
      else if (state.zoom !== previous.zoom) settle();
    });
    const viewport = document.querySelector('.reader__viewport');
    const observer = viewport ? new ResizeObserver(settle) : null;
    if (viewport) observer?.observe(viewport);

    return () => {
      unsubscribe();
      observer?.disconnect();
      for (const timer of timers) window.clearTimeout(timer);
      style.remove();
    };
  }, [active]);
}
