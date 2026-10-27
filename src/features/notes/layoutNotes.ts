/** Distance from a card's top edge to the point where its leader line attaches. */
export const NOTE_ATTACH_OFFSET = 16;
/** Vertical space kept between stacked cards. */
export const NOTE_GAP = 8;
/** Height of a card collapsed to its one-line preview. */
export const NOTE_COMPACT_HEIGHT = 32;

export interface NoteBox {
  id: string;
  /** Anchor position in px from the top of the page. */
  anchor: number;
  /** Natural (fully shown) card height in px. */
  height: number;
  /** Never collapsed: the card is being edited or the reader expanded it. */
  pinned?: boolean;
}

export interface NotePlacement {
  id: string;
  /** Card top in px from the top of the page. */
  top: number;
  /** Rendered card height (the compact height when `compact`). */
  height: number;
  compact: boolean;
  anchor: number;
  /** Where the leader meets the card (`top` + attach offset). */
  attach: number;
  /** True when the card sits away from its anchor, so a tether is drawn. */
  displaced: boolean;
}

/**
 * Stacks one page's notes down the margin without overlap or reordering.
 *
 * Each card wants to sit with its attach point level with its anchor; a card
 * that would collide with the previous one is pushed below it. When the stack
 * would pass the bottom of the page, the fewest trailing cards possible fall
 * back to the compact one-line form (cards at or before the last pinned card
 * keep their size, so what the reader is working on never shuffles). If that
 * still does not fit, the stack is pulled upwards so it stays on the page.
 */
export function layoutNotes(boxes: readonly NoteBox[], pageHeight: number): NotePlacement[] {
  const ordered = [...boxes].sort((a, b) => a.anchor - b.anchor);
  const firstCompactable = ordered.findLastIndex((box) => box.pinned) + 1;

  let placed = place(ordered, ordered.length);
  for (let from = ordered.length - 1; from >= firstCompactable && bottomOf(placed) > pageHeight; from--) {
    placed = place(ordered, from);
  }
  if (bottomOf(placed) > pageHeight) placed = packUp(placed, pageHeight);

  return placed.map((p) => {
    const attach = p.top + NOTE_ATTACH_OFFSET;
    return { ...p, attach, displaced: Math.abs(attach - p.anchor) > 0.5 };
  });
}

type Placed = Omit<NotePlacement, 'attach' | 'displaced'>;

/** Top-down pass; boxes from index `compactFrom` onwards are compacted unless pinned. */
function place(ordered: readonly NoteBox[], compactFrom: number): Placed[] {
  const result: Placed[] = [];
  let floor = 0;
  ordered.forEach((box, index) => {
    const compact = index >= compactFrom && !box.pinned;
    const height = compact ? NOTE_COMPACT_HEIGHT : box.height;
    const top = Math.max(box.anchor - NOTE_ATTACH_OFFSET, floor);
    result.push({ id: box.id, top, height, compact, anchor: box.anchor });
    floor = top + height + NOTE_GAP;
  });
  return result;
}

/** Bottom-up pass that slides cards up so the last one ends at the page bottom. */
function packUp(placed: readonly Placed[], pageHeight: number): Placed[] {
  const result = placed.map((p) => ({ ...p }));
  let limit = pageHeight;
  for (let i = result.length - 1; i >= 0; i--) {
    result[i].top = Math.min(result[i].top, limit - result[i].height);
    limit = result[i].top - NOTE_GAP;
  }
  let floor = 0;
  for (const p of result) {
    p.top = Math.max(p.top, floor);
    floor = p.top + p.height + NOTE_GAP;
  }
  return result;
}

function bottomOf(placed: readonly Placed[]): number {
  const last = placed.at(-1);
  return last ? last.top + last.height : 0;
}

/** Whether the vertical span [top, bottom] overlaps any placed card, with `margin` px of slack. */
export function overlapsPlacement(
  placed: readonly NotePlacement[],
  top: number,
  bottom: number,
  margin = 0,
): boolean {
  return placed.some((p) => top < p.top + p.height + margin && bottom > p.top - margin);
}
