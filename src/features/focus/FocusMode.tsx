import { useEffect, useState } from 'react';
import { keyLabel } from '../commands/keys';
import { useReaderStore } from '../reader/readerStore';
import { exitFocusMode, useFocusStore } from './focusStore';
import './focus.css';

/** Pointer distance from the top edge (CSS px) that brings the toolbar back; the toolbar's own height. */
const REVEAL_ZONE = 48;
/** How long the toolbar lingers once the pointer has left the top edge. */
const HIDE_DELAY_MS = 500;
const HINT_MS = 5000;
/** Outlasts the hint's fade-out transition in focus.css. */
const FADE_MS = 400;

/**
 * Applies focus mode to the reader while it is active (F, Esc to leave): the toolbar recedes, the
 * sidebar closes, pages other than the one being read dim, and margin notes fade until their page is
 * hovered. `html.focus-mode` is the hook other features style against.
 */
export function FocusMode() {
  const active = useFocusStore((s) => s.active);
  // Leaving the reader ends focus mode, so the next book doesn't open in it.
  useEffect(() => () => exitFocusMode(), []);

  return (
    <div className="focus-hint-region" role="status">
      {active && <FocusModeEffects />}
    </div>
  );
}

function FocusModeEffects() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('focus-mode');
    const sidebarWasOpen = useReaderStore.getState().sidebarOpen;
    if (sidebarWasOpen) useReaderStore.getState().setSidebarOpen(false);
    // A toolbar button that keeps keyboard focus would keep the toolbar on screen.
    if (document.activeElement?.closest('.reader__toolbar')) {
      document
        .querySelector<HTMLElement>('.reader__viewport')
        ?.focus({ preventScroll: true, focusVisible: false });
    }
    return () => {
      root.classList.remove('focus-mode');
      if (sidebarWasOpen) useReaderStore.getState().setSidebarOpen(true);
    };
  }, []);
  useToolbarReveal();
  useSpotlight();
  return <FocusHint />;
}

/** A brief pill saying how to get the controls back and how to leave. */
function FocusHint() {
  const [phase, setPhase] = useState<'shown' | 'fading' | 'gone'>('shown');
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase('fading'), HINT_MS),
      window.setTimeout(() => setPhase('gone'), HINT_MS + FADE_MS),
    ];
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div className="focus-hint" data-fading={phase === 'fading' || undefined}>
      Focus mode · Move to the top edge for controls · {keyLabel('focus')} or {keyLabel('dismiss')} to leave
    </div>
  );
}

/**
 * Brings the toolbar back (`html.focus-toolbar`) when the pointer reaches the top edge or a tap lands
 * there, and lets it go shortly after. Keyboard focus and open menus keep it in view through CSS.
 */
function useToolbarReveal() {
  useEffect(() => {
    const root = document.documentElement;
    // Entering with the pointer on the toolbar (a click on its button) must not bring it straight back,
    // so the top edge only counts once the pointer has been below it.
    let armed = !document.querySelector('.reader__toolbar')?.matches(':hover');
    let timer = 0;

    const hideSoon = () => {
      if (timer || !root.classList.contains('focus-toolbar')) return;
      timer = window.setTimeout(() => {
        timer = 0;
        root.classList.remove('focus-toolbar');
      }, HIDE_DELAY_MS);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.clientY > REVEAL_ZONE || event.type === 'pointerdown') armed = true;
      if (armed && event.clientY <= REVEAL_ZONE) {
        window.clearTimeout(timer);
        timer = 0;
        root.classList.add('focus-toolbar');
      } else hideSoon();
    };

    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    root.addEventListener('mouseleave', hideSoon);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      root.removeEventListener('mouseleave', hideSoon);
      root.classList.remove('focus-toolbar');
    };
  }, []);
}

/**
 * Keeps one style rule dimming every page but the one at the centre of the viewport, rewritten only
 * when that page changes. Zoom, resizing and the sidebar closing can move the centre page without
 * moving the reading location, so the viewport and the page column are observed too.
 */
function useSpotlight() {
  useEffect(() => {
    const style = document.head.appendChild(document.createElement('style'));
    let current = 0;
    const update = () => {
      const { controller, location } = useReaderStore.getState();
      const page = (controller?.getVisibleCenter() ?? location).page;
      if (page === current) return;
      current = page;
      style.textContent = `html.focus-mode .reader__page:not([data-page="${page}"]) { opacity: var(--focus-page-opacity); }`;
    };
    update();

    const unsubscribe = useReaderStore.subscribe((state, previous) => {
      if (state.location !== previous.location || state.controller !== previous.controller) update();
    });
    const observer = new ResizeObserver(update);
    const viewport = document.querySelector('.reader__viewport');
    if (viewport) observer.observe(viewport);
    const pages = viewport?.querySelector('.reader__pages');
    if (pages) observer.observe(pages);

    return () => {
      unsubscribe();
      observer.disconnect();
      style.remove();
    };
  }, []);
}
