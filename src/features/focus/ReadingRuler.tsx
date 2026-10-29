import { type CSSProperties, useEffect, useRef } from 'react';
import { clamp } from '@/lib/util';
import { useReaderStore } from '../reader/readerStore';
import './readingRuler.css';

/**
 * A band that follows the pointer to keep your place on the line (R), with the page above and below it
 * softly dimmed. It never takes pointer events, so text stays selectable.
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

    // Placed from the pointer's screen position, so it stays under the pointer when the toolbar slides
    // away and the document area grows.
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

  // About two text lines, growing with the zoom level.
  const band = Math.round(clamp(38 * zoomScale, 30, 170));
  return (
    <div
      ref={rootRef}
      className="reading-ruler"
      style={{ '--ruler-band': `${band}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="reading-ruler__veil reading-ruler__veil--above" />
      <div className="reading-ruler__veil reading-ruler__veil--below" />
    </div>
  );
}
