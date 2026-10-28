/** Geometry for the bookshelf view: spine sizes and how spines wrap onto shelves. */

export const SPINE_MIN_WIDTH = 26;
export const SPINE_MAX_WIDTH = 64;

/** Thicker books get wider spines; square-root scaling keeps a 1000-page tome from dwarfing the rest. */
export function spineWidth(pageCount: number): number {
  const pages = Number.isFinite(pageCount) && pageCount > 0 ? pageCount : 120;
  return Math.round(Math.min(SPINE_MAX_WIDTH, Math.max(SPINE_MIN_WIDTH, 16 + Math.sqrt(pages) * 2.2)));
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Books on a real shelf vary in height; derive a stable height from the id. */
export function spineHeight(id: string, min = 188, max = 232): number {
  return min + (hash(id) % (max - min + 1));
}

/** A small, stable sideways nudge for books lying in a pile, so the stack looks hand-placed. */
export function pileNudge(id: string, range = 8): number {
  return (hash(`${id}:pile`) % (range * 2 + 1)) - range;
}

/** Splits spines into shelf rows that fit `available` px, keeping order. */
export function layoutShelves(widths: number[], available: number, gap: number): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  widths.forEach((width, i) => {
    const needed = row.length ? used + gap + width : width;
    if (row.length && needed > available) {
      rows.push(row);
      row = [i];
      used = width;
    } else {
      row.push(i);
      used = needed;
    }
  });
  if (row.length) rows.push(row);
  return rows;
}
