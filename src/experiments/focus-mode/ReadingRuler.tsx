import { useEffect, useRef } from 'react';
import { useReaderStore } from '@/features/reader/readerStore';
import { rulerBandHeight } from './focusLogic';

/**
 * A band that follows the pointer, with the page above and below it softly dimmed. The panes never take
 * pointer events, so text stays selectable and clickable.
 */
export function ReadingRuler() {
  const zoomScale = useReaderStore((s) => s.zoom.scale);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const main = root?.parentElement;
    if (!root || !main) return;

    let y = main.clientHeight * 0.4;
    let frame = 0;
    const paint = () => {
      frame = 0;
      root.style.setProperty('--ruler-y', `${y}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = main.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      // The revealed toolbar overlays the page; the ruler stays where the reader was looking.
      if (!inside || (event.target instanceof Element && event.target.closest('.reader__toolbar'))) return;
      y = event.clientY - rect.top;
      schedule();
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    // Keep the dimming clear of the scrollbar.
    const viewport = main.querySelector<HTMLElement>('.reader__viewport');
    const observer = viewport
      ? new ResizeObserver(() => {
          root.style.right = `${viewport.offsetWidth - viewport.clientWidth}px`;
        })
      : null;
    if (viewport) observer?.observe(viewport);

    return () => {
      window.removeEventListener('pointermove', onMove);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="focus-ruler"
      style={{ '--ruler-h': `${rulerBandHeight(zoomScale)}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="focus-ruler__pane focus-ruler__pane--above" />
      <div className="focus-ruler__pane focus-ruler__pane--below" />
    </div>
  );
}
