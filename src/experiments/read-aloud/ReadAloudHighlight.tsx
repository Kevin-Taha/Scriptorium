import type { CSSProperties } from 'react';
import type { PageRect } from '@/features/search/pageText';
import type { PageSlotProps } from '../types';
import { usePlayer } from './player';
import './readAloud.css';

const box = (rect: PageRect): CSSProperties => ({
  left: `${rect.x * 100}%`,
  top: `${rect.y * 100}%`,
  width: `${rect.width * 100}%`,
  height: `${rect.height * 100}%`,
});

/** The sentence (and word) being read, drawn over its page. Rectangles are page fractions, so zoom never moves them. */
export function ReadAloudHighlight({ page }: PageSlotProps) {
  const highlight = usePlayer((s) => (s.highlight?.page === page ? s.highlight : null));
  if (!highlight) return null;
  return (
    <div className="ra-highlight" aria-hidden="true">
      {highlight.rects.map((rect) => (
        <span
          key={`${highlight.key}:${rect.x}:${rect.y}`}
          className="ra-highlight__sentence"
          style={box(rect)}
        />
      ))}
      {highlight.words.map((rect) => (
        // Keyed by line so the marker glides along a line instead of being re-created per word.
        <span key={`${rect.y}:${rect.height}`} className="ra-highlight__word" style={box(rect)} />
      ))}
    </div>
  );
}
