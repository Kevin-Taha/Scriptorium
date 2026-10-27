import { memo } from 'react';
import type { Highlight } from '@/lib/types';
import type { PageSize } from '../reader/Viewer';
import { useIsHighlightEmphasised, useIsHighlightPulsing } from './highlightUi';
import { useHighlightsForPage } from './highlightsStore';
import './highlights.css';

/**
 * A page's highlights, drawn in the page overlay as marker-style bars. Bars are
 * percentages of the sheet, so they stay on the text through every zoom change,
 * and never take pointer events: selecting text underneath works as usual and
 * `HighlightPopover` hit-tests clicks against the stored rectangles instead.
 * Render this before `SearchHighlights` so search matches paint on top.
 */
export function PageHighlights({ page }: { page: number; size: PageSize }) {
  const highlights = useHighlightsForPage(page);
  if (highlights.length === 0) return null;

  return (
    <div className="page-highlights" aria-hidden="true">
      {highlights.map((highlight) => (
        <PageHighlight key={highlight.id} highlight={highlight} />
      ))}
    </div>
  );
}

const PageHighlight = memo(function PageHighlight({ highlight }: { highlight: Highlight }) {
  const emphasised = useIsHighlightEmphasised(highlight.id);
  const pulsing = useIsHighlightPulsing(highlight.id);
  const className = `page-highlight${emphasised ? ' is-emphasised' : ''}${pulsing ? ' is-pulsing' : ''}`;

  return highlight.rects.map((rect, index) => (
    <span
      key={index}
      className={className}
      data-note-color={highlight.color}
      data-highlight-id={highlight.id}
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
      }}
    />
  ));
});
