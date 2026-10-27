import type { PageSize } from '../reader/Viewer';

/**
 * Anchor dots, leaders and tethers are drawn by `MarginColumn`, because their
 * geometry depends on how the margin stacks the cards. Nothing is layered over
 * the page sheet itself, so this overlay slot is intentionally empty.
 */
export function PageNoteMarkers(_props: { page: number; size: PageSize }) {
  return null;
}
