import { useMemo } from 'react';
import type { PageSize } from '../reader/Viewer';
import { rangeRects } from './pageText';
import { useSearchStore } from './searchStore';
import './search.css';

/**
 * Highlights search matches on one page (rendered in the page overlay).
 * Rectangles are percentages of the sheet, so they stay put through every zoom change.
 */
export function SearchHighlights({ page }: { page: number; size: PageSize }) {
  const result = useSearchStore((s) => s.results.find((candidate) => candidate.page === page));
  const activeMatch = useSearchStore((s) => (s.active?.page === page ? s.active.index : -1));
  const highlights = useMemo(
    () =>
      result?.matches.flatMap(({ start, end }, match) =>
        rangeRects(result.text, start, end).map((rect, i) => ({ key: `${match}.${i}`, match, rect })),
      ) ?? [],
    [result],
  );
  if (highlights.length === 0) return null;

  return (
    <div className="search-highlights" aria-hidden="true">
      {highlights.map(({ key, match, rect }) => (
        <span
          key={key}
          className={`search-highlight${match === activeMatch ? ' is-active' : ''}`}
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.width * 100}%`,
            height: `${rect.height * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
