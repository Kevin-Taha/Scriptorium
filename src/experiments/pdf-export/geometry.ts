import type { HighlightRect, NoteColor } from '@/lib/types';

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

type Point = [number, number];
export type PdfRect = [number, number, number, number];

const COLORS: Record<NoteColor, [number, number, number]> = {
  amber: [0.9, 0.8, 0.52],
  sage: [0.74, 0.82, 0.67],
  sky: [0.67, 0.8, 0.9],
  rose: [0.9, 0.71, 0.74],
  lavender: [0.8, 0.75, 0.9],
};

export function annotationColor(color: NoteColor): [number, number, number] {
  return COLORS[color] ?? COLORS.amber;
}

/** Inverts pdf.js's default viewport: fractions start at the displayed top-left. */
export function fractionToPdf(x: number, y: number, box: PageBox): Point {
  const rotation = ((box.rotation % 360) + 360) % 360;
  switch (rotation) {
    case 0:
      return [box.x + x * box.width, box.y + (1 - y) * box.height];
    case 90:
      return [box.x + y * box.width, box.y + x * box.height];
    case 180:
      return [box.x + (1 - x) * box.width, box.y + y * box.height];
    case 270:
      return [box.x + (1 - y) * box.width, box.y + (1 - x) * box.height];
    default:
      throw new Error(`Unsupported page rotation: ${box.rotation}°.`);
  }
}

/** Display-order corners preserve text orientation even on rotated pages. */
export function quadPoints(rect: HighlightRect, box: PageBox): number[] {
  return [
    ...fractionToPdf(rect.x, rect.y, box),
    ...fractionToPdf(rect.x + rect.w, rect.y, box),
    ...fractionToPdf(rect.x, rect.y + rect.h, box),
    ...fractionToPdf(rect.x + rect.w, rect.y + rect.h, box),
  ];
}

export function bounds(points: number[]): PdfRect {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** An 18pt square at the displayed right edge, centred on the note anchor. */
export function noteRect(y: number, box: PageBox, inset = 0): PdfRect {
  const rotated = ((box.rotation % 180) + 180) % 180 !== 0;
  const width = rotated ? box.height : box.width;
  const height = rotated ? box.width : box.height;
  const w = Math.min(18, width) / width;
  const h = Math.min(18, height) / height;
  const top = Math.max(0, Math.min(1 - h, y - h / 2));
  const left = Math.max(0, 1 - w - Math.max(0, inset) / width);
  return bounds(quadPoints({ x: left, y: top, w, h }, box));
}
