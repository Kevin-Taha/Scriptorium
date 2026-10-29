import { useEffect } from 'react';
import { ariaKeyShortcuts, withShortcut } from '../commands/keys';
import { useBookmarksStore, useIsBookmarked } from './bookmarksStore';
import { usePageLabel } from './pageLabels';

/** How near a page's top-right corner (in CSS px) the pointer reveals that page's ghost ribbon. */
const REVEAL_HEIGHT = 96;
const REVEAL_WIDTH = 144;
const REVEAL_ATTRIBUTE = 'data-ribbon-reveal';

/**
 * A page's bookmark, as a ribbon on its top-right corner: filled when set, a ghost to click when
 * not. It stays out of the Tab order (that would be a stop per page); keyboard users have B,
 * Go to and the Bookmarks tab.
 */
export function BookmarkRibbon({ page }: { page: number }) {
  const bookmarked = useIsBookmarked(page);
  const toggle = useBookmarksStore((s) => s.toggle);
  const label = usePageLabel(page);

  return (
    <button
      type="button"
      className="bookmark-ribbon tooltip tooltip--below"
      aria-label={`Bookmark page ${label}`}
      aria-pressed={bookmarked}
      aria-keyshortcuts={ariaKeyShortcuts('bookmark')}
      data-tooltip={withShortcut(bookmarked ? 'Remove bookmark' : 'Bookmark this page', 'bookmark')}
      tabIndex={-1}
      // Leaves focus where it was, so the keyboard keeps scrolling the document.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => toggle(page)}
    >
      {bookmarked && <span className="page-sheet__ribbon" aria-hidden="true" />}
    </button>
  );
}

/** The page sheet whose top-right corner the pointer is near, if any. */
function cornerSheet(event: PointerEvent): Element | null {
  const sheet = event.target instanceof Element ? event.target.closest('.page-sheet') : null;
  if (!sheet || getSelection()?.isCollapsed === false) return null;
  const box = sheet.getBoundingClientRect();
  return event.clientY - box.top <= REVEAL_HEIGHT && box.right - event.clientX <= REVEAL_WIDTH ? sheet : null;
}

/**
 * Reveals the ghost ribbon of the page whose corner the pointer is near, by marking its sheet.
 * One listener serves every page and takes no pointer events, so text stays selectable. Nothing
 * is revealed while a button is held (selecting, dragging), while text is selected, or once the
 * document scrolls.
 */
export function useRibbonReveal(): void {
  useEffect(() => {
    let revealed: Element | null = null;
    const reveal = (sheet: Element | null) => {
      if (sheet === revealed) return;
      revealed?.removeAttribute(REVEAL_ATTRIBUTE);
      sheet?.setAttribute(REVEAL_ATTRIBUTE, '');
      revealed = sheet;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!event.buttons) reveal(cornerSheet(event));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest('.bookmark-ribbon'))) reveal(null);
    };
    const hide = () => reveal(null);
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', hide, true);
      hide();
    };
  }, []);
}
