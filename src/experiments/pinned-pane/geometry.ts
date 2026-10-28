import type { PaneLayout } from './model';

export interface Bounds {
  width: number;
  height: number;
}

export const MIN_WIDTH = 240;
export const MIN_HEIGHT = 200;
/** The pane never grows past this share of the reading area. */
export const MAX_SHARE = 0.7;
export const DOCK_MIN_WIDTH = 260;
export const DOCK_MAX_SHARE = 0.5;

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function maxSize(bounds: Bounds): Bounds {
  return {
    width: Math.max(MIN_WIDTH, Math.floor(bounds.width * MAX_SHARE)),
    height: Math.max(MIN_HEIGHT, Math.floor(bounds.height * MAX_SHARE)),
  };
}

/**
 * Keeps size within the limits and the pane wholly inside the reading area.
 * `collapsedHeight` is the height actually shown while the pane is collapsed to its header.
 */
export function clampLayout(layout: PaneLayout, bounds: Bounds, collapsedHeight?: number): PaneLayout {
  const max = maxSize(bounds);
  const width = Math.round(clamp(layout.width, MIN_WIDTH, Math.min(max.width, bounds.width)));
  const height = Math.round(clamp(layout.height, MIN_HEIGHT, Math.min(max.height, bounds.height)));
  return {
    width,
    height,
    right: Math.round(clamp(layout.right, 0, bounds.width - width)),
    bottom: Math.round(clamp(layout.bottom, 0, bounds.height - (collapsedHeight ?? height))),
  };
}

export function clampDockWidth(width: number, bounds: Bounds): number {
  return Math.round(clamp(width, DOCK_MIN_WIDTH, Math.floor(bounds.width * DOCK_MAX_SHARE)));
}

export function movedLayout(
  start: PaneLayout,
  dx: number,
  dy: number,
  bounds: Bounds,
  collapsedHeight?: number,
): PaneLayout {
  return clampLayout(
    { ...start, right: start.right - dx, bottom: start.bottom - dy },
    bounds,
    collapsedHeight,
  );
}

function toEdges(layout: PaneLayout, bounds: Bounds): Edges {
  const right = bounds.width - layout.right;
  const bottom = bounds.height - layout.bottom;
  return { left: right - layout.width, top: bottom - layout.height, right, bottom };
}

function fromEdges(edges: Edges, bounds: Bounds): PaneLayout {
  return {
    right: bounds.width - edges.right,
    bottom: bounds.height - edges.bottom,
    width: edges.right - edges.left,
    height: edges.bottom - edges.top,
  };
}

/** Drags one corner by (dx, dy); the opposite corner stays put. */
export function resizedLayout(
  start: PaneLayout,
  corner: Corner,
  dx: number,
  dy: number,
  bounds: Bounds,
): PaneLayout {
  const begin = clampLayout(start, bounds);
  const max = maxSize(bounds);
  const edges = toEdges(begin, bounds);
  if (corner === 'nw' || corner === 'sw') {
    edges.left = clamp(edges.left + dx, Math.max(0, edges.right - max.width), edges.right - MIN_WIDTH);
  } else {
    edges.right = clamp(
      edges.right + dx,
      edges.left + MIN_WIDTH,
      Math.min(bounds.width, edges.left + max.width),
    );
  }
  if (corner === 'nw' || corner === 'ne') {
    edges.top = clamp(edges.top + dy, Math.max(0, edges.bottom - max.height), edges.bottom - MIN_HEIGHT);
  } else {
    edges.bottom = clamp(
      edges.bottom + dy,
      edges.top + MIN_HEIGHT,
      Math.min(bounds.height, edges.top + max.height),
    );
  }
  return clampLayout(fromEdges(edges, bounds), bounds);
}
