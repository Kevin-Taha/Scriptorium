import { useMemo } from 'react';
import { highlightSegments } from './reviewFilter';

/** Text with the review's search terms marked. */
export function MarkedText({ text, terms }: { text: string; terms: string[] }) {
  const segments = useMemo(() => highlightSegments(text, terms), [text, terms]);
  return segments.map((segment, i) =>
    segment.match ? (
      <mark key={i} className="review-mark">
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  );
}
