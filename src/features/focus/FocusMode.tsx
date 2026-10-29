import { useEffect } from 'react';
import { useReaderStore } from '../reader/readerStore';
import { FocusHint } from './FocusHint';
import { exitFocusMode, useFocusMode } from './focusStore';
import { useSpotlight } from './useSpotlight';
import { useToolbarReveal } from './useToolbarReveal';
import './focus.css';

/**
 * Applies focus mode to the reader while it is active (F, Esc to leave): the toolbar recedes, the
 * sidebar closes, pages other than the one being read dim, and margin notes fade until their page is
 * hovered. `html.focus-mode` is the hook other features style against.
 */
export function FocusMode() {
  const active = useFocusMode();
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
    const reader = useReaderStore.getState();
    const sidebarWasOpen = reader.sidebarOpen;
    if (sidebarWasOpen) reader.setSidebarOpen(false);
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
