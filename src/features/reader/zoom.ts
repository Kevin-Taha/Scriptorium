import type { ZoomState } from '@/lib/types';
import { clamp } from '@/lib/util';
import { MAX_SCALE, MIN_SCALE, useReaderStore } from './readerStore';

/** Discrete zoom stops used by zoom in/out (1 = 100%). */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4] as const;

export function nextZoomStep(scale: number, direction: 1 | -1): number {
  const epsilon = 0.01;
  const steps = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  const next = steps.find((s) => (direction > 0 ? s > scale + epsilon : s < scale - epsilon));
  return clamp(next ?? scale, MIN_SCALE, MAX_SCALE);
}

export function zoomIn(): void {
  const { zoom, setZoom } = useReaderStore.getState();
  setZoom({ mode: 'custom', scale: nextZoomStep(zoom.scale, 1) });
}

export function zoomOut(): void {
  const { zoom, setZoom } = useReaderStore.getState();
  setZoom({ mode: 'custom', scale: nextZoomStep(zoom.scale, -1) });
}

/** Switches to a fit mode; the viewer recomputes `scale` for the current viewport. */
export function setZoomMode(mode: Exclude<ZoomState['mode'], 'custom'>): void {
  const { zoom, setZoom } = useReaderStore.getState();
  setZoom({ mode, scale: zoom.scale });
}

export function formatZoom(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}
