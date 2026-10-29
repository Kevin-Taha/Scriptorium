import { type CSSProperties, useEffect, useRef } from 'react';
import { useReaderStore } from '../reader/readerStore';
import { rulerBandHeight } from './focusLogic';
import './readingRuler.css';

/**
 * A band that follows the pointer to keep your place on the line (R), with the page above and below it
 * softly dimmed. Mounted only while on; it never takes pointer events, so text stays selectable.
 */
export function ReadingRuler() {
  const zoomScale = useReaderStore((s) => s.zoom.scale);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const main = root.parentElement!;
    const viewport = main.querySelector<HTMLElement>('.reader__viewport');
    let pointerY: number | null = null;
    let frame = 0;

    // Positioned from the screen position of the pointer, so it stays under it when the toolbar
    // slides away and the document area grows.
    const place = () => {
      frame = 0;
      if (pointerY !== null) {
        root.style.setProperty('--ruler-y', `${pointerY - main.getBoundingClientRect().top}px`);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerY = event.clientY;
      schedule();
    };
    main.addEventListener('pointermove', onMove, { passive: true });

    // The scrollbars stay clear of the dimming.
    const observer = new ResizeObserver(() => {
      if (viewport) {
        root.style.right = `${viewport.offsetWidth - viewport.clientWidth}px`;
        root.style.bottom = `${viewport.offsetHeight - viewport.clientHeight}px`;
      }
      schedule();
    });
    observer.observe(viewport ?? main);

    return () => {
      main.removeEventListener('pointermove', onMove);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="reading-ruler"
      style={{ '--ruler-band': `${rulerBandHeight(zoomScale)}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="reading-ruler__veil reading-ruler__veil--above" />
      <div className="reading-ruler__veil reading-ruler__veil--below" />
    </div>
  );
}
