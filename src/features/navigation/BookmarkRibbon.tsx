import { useIsBookmarked } from './bookmarksStore';

export function BookmarkRibbon({ page }: { page: number }) {
  const bookmarked = useIsBookmarked(page);
  return bookmarked ? <span className="page-sheet__ribbon" aria-hidden="true" /> : null;
}
