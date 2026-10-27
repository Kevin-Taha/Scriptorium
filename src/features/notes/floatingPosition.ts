import { useLayoutEffect, type RefObject } from 'react';

/** Where a floating control should attach: a point and the vertical extent of the thing it refers to. */
export interface FloatingAnchor {
  /** Horizontal centre, in viewport px. */
  x: number;
  top: number;
  bottom: number;
  /** Put the control below the anchor when it fits (so it never covers a multi-line selection). */
  preferBelow?: boolean;
}

interface Size {
  width: number;
  height: number;
}

/** The rectangle (viewport px) a floating control must stay inside. */
export interface FloatingArea {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

const OFFSET = 8;
const EDGE = 8;

/**
 * Sits a control 8px above its anchor, or below it when there is no room (or
 * `preferBelow`), centred on the anchor and kept inside `area`.
 */
export function placeFloating(
  anchor: FloatingAnchor,
  size: Size,
  area: FloatingArea,
): { top: number; left: number } {
  const lowest = area.bottom - size.height - EDGE;
  const above = anchor.top - OFFSET - size.height;
  const below = anchor.bottom + OFFSET;
  const fitsAbove = above >= area.top + EDGE;
  const fitsBelow = below <= lowest;
  const top = (anchor.preferBelow && fitsBelow) || !fitsAbove ? below : above;
  const left = Math.max(
    area.left + EDGE,
    Math.min(anchor.x - size.width / 2, area.right - size.width - EDGE),
  );
  return { top: Math.round(Math.min(top, lowest)), left: Math.round(left) };
}

/** Positions `ref` (a `position: fixed` element) next to `anchor` before it is painted. */
export function useFloatingPosition(
  ref: RefObject<HTMLElement | null>,
  anchor: FloatingAnchor | null,
  mounted: boolean,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !anchor) return;
    // Keep clear of the toolbar above and the sidebar beside the pages.
    const bounds = document.querySelector('.reader__viewport')?.getBoundingClientRect();
    const { top, left } = placeFloating(
      anchor,
      { width: element.offsetWidth, height: element.offsetHeight },
      {
        top: Math.max(bounds?.top ?? 0, 0),
        left: Math.max(bounds?.left ?? 0, 0),
        right: Math.min(bounds?.right ?? Infinity, window.innerWidth),
        bottom: Math.min(bounds?.bottom ?? Infinity, window.innerHeight),
      },
    );
    element.style.top = `${top}px`;
    element.style.left = `${left}px`;
  }, [ref, anchor, mounted]);
}
