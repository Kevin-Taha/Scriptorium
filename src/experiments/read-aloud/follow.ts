import { useEffect } from 'react';
import { useReaderStore, type ViewerController } from '@/features/reader/readerStore';
import { DEFAULT_METRICS } from '@/features/reader/viewerLayout';
import type { ReadingLocation } from '@/lib/types';
import { usePlayer } from './player';

const VIEWPORT = '.reader__viewport';
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
/** The sentence is kept above this share of the viewport height. */
const COMFORT_BOTTOM = 0.75;
/** …and is brought to this share of it when the viewer has to scroll. */
const TARGET_TOP = 1 / 3;
const EDGE_PX = 8;

/**
 * Converts a point `yPx` below the top of `page` into a location. `yPx` may be
 * negative (the point lies in the pages above), which `scrollTo` could not
 * express on its own because offsets are clamped to the page.
 */
export function locationFromPagePx(
  controller: Pick<ViewerController, 'getPageSize'>,
  page: number,
  yPx: number,
  pageGap: number,
): ReadingLocation {
  let current = page;
  let y = yPx;
  while (y < 0 && current > 1) {
    const above = controller.getPageSize(current - 1);
    if (!above) break;
    y += above.height + pageGap;
    current -= 1;
  }
  const height = controller.getPageSize(current)?.height ?? 1;
  return { page: current, offset: y / height };
}

/**
 * Smoothly scrolls so the sentence being read sits in the upper third of the
 * viewport, but only when it has left the comfortable band (or is cut off).
 */
export function scrollToHighlight(): void {
  const { highlight } = usePlayer.getState();
  const controller = useReaderStore.getState().controller;
  const viewport = document.querySelector<HTMLElement>(VIEWPORT);
  const first = highlight?.rects[0];
  const last = highlight?.rects.at(-1);
  if (!highlight || !first || !last || !controller || !viewport) return;
  const size = controller.getPageSize(highlight.page);
  if (!size) return;

  const height = viewport.clientHeight;
  const sheet = viewport.querySelector<HTMLElement>(`.page-sheet[data-page="${highlight.page}"]`);
  if (sheet) {
    const view = viewport.getBoundingClientRect();
    const box = sheet.getBoundingClientRect();
    const top = box.top - view.top + first.y * box.height;
    const bottom = box.top - view.top + (last.y + last.height) * box.height;
    if (top >= EDGE_PX && top <= height * COMFORT_BOTTOM && bottom <= height - EDGE_PX) return;
  }

  const pageGap = Number.parseFloat(getComputedStyle(viewport).getPropertyValue('--page-gap'));
  const target = locationFromPagePx(
    controller,
    highlight.page,
    first.y * size.height - height * TARGET_TOP + DEFAULT_METRICS.anchorInset,
    Number.isFinite(pageGap) ? pageGap : DEFAULT_METRICS.pageGap,
  );
  controller.scrollTo(target, { smooth: true });
}

/** Follow-along: keeps the sentence in view, and backs off for a few seconds when the reader scrolls by hand. */
export function useFollowAlong(): void {
  useEffect(
    () =>
      usePlayer.subscribe((state, previous) => {
        if (state.highlight && state.highlight.key !== previous.highlight?.key && state.following) {
          scrollToHighlight();
        }
      }),
    [],
  );

  useEffect(() => {
    const inViewport = (target: EventTarget | null) =>
      target instanceof Element && target.closest(VIEWPORT) !== null;
    const scrolled = () => usePlayer.getState().userScrolled();
    const onWheel = (event: Event) => {
      if (inViewport(event.target)) scrolled();
    };
    const onPointerDown = (event: PointerEvent) => {
      // A press on the viewport itself (not a page) is the scrollbar.
      if (event.target instanceof Element && event.target.matches(VIEWPORT)) scrolled();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key) && inViewport(event.target)) scrolled();
    };
    const options = { capture: true, passive: true } as const;
    document.addEventListener('wheel', onWheel, options);
    document.addEventListener('touchmove', onWheel, options);
    document.addEventListener('pointerdown', onPointerDown, options);
    document.addEventListener('keydown', onKeyDown, options);
    return () => {
      document.removeEventListener('wheel', onWheel, options);
      document.removeEventListener('touchmove', onWheel, options);
      document.removeEventListener('pointerdown', onPointerDown, options);
      document.removeEventListener('keydown', onKeyDown, options);
    };
  }, []);
}
