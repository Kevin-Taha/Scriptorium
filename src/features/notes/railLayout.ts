/** Size of a note marker on the narrow-screen margin rail (its hit area is larger, see notes.css). */
export const RAIL_MARKER_SIZE = 28;
/** Vertical space kept between stacked markers. */
export const RAIL_MARKER_GAP = 8;

export interface RailAnchor {
  id: string;
  /** Anchor position in px from the top of the page. */
  anchor: number;
}

export interface RailMarkerPlacement {
  id: string;
  anchor: number;
  /** Marker top in px from the top of the page. */
  top: number;
  height: number;
}

/**
 * Stacks one page's note markers down the rail: each is centred on its anchor
 * unless that would overlap the one above, in which case it is pushed below it.
 * Order never changes, and if the stack runs past the bottom of the page it is
 * slid back up so every marker stays on the page.
 */
export function layoutRailMarkers(anchors: readonly RailAnchor[], pageHeight: number): RailMarkerPlacement[] {
  const ordered = [...anchors].sort((a, b) => a.anchor - b.anchor);
  const placed: RailMarkerPlacement[] = [];
  let floor = 0;
  for (const { id, anchor } of ordered) {
    const top = Math.max(anchor - RAIL_MARKER_SIZE / 2, floor);
    placed.push({ id, anchor, top, height: RAIL_MARKER_SIZE });
    floor = top + RAIL_MARKER_SIZE + RAIL_MARKER_GAP;
  }
  let limit = pageHeight;
  for (let i = placed.length - 1; i >= 0; i--) {
    placed[i].top = Math.min(placed[i].top, limit - RAIL_MARKER_SIZE);
    limit = placed[i].top - RAIL_MARKER_GAP;
  }
  // A page too short for every marker keeps them in order from the top and lets the last overflow.
  floor = 0;
  for (const p of placed) {
    p.top = Math.max(p.top, floor);
    floor = p.top + RAIL_MARKER_SIZE + RAIL_MARKER_GAP;
  }
  return placed;
}
