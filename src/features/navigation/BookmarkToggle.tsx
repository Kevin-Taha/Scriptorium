import { Bookmark } from 'lucide-react';
import { useReaderStore } from '../reader/readerStore';
import { useBookmarksStore, useIsBookmarked } from './bookmarksStore';

export function BookmarkToggle() {
  const page = useReaderStore((s) => s.location.page);
  const bookmarked = useIsBookmarked(page);
  const toggle = useBookmarksStore((s) => s.toggle);

  return (
    <button
      className="btn btn--ghost btn--icon tooltip tooltip--below bookmark-toggle"
      aria-label="Bookmark page (B)"
      aria-pressed={bookmarked}
      data-tooltip="Bookmark page (B)"
      onClick={() => toggle(page)}
    >
      <Bookmark fill={bookmarked ? 'currentColor' : 'none'} />
    </button>
  );
}
