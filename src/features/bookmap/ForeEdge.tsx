import { memo } from 'react';
import { type RailChapter, type RailMark, roundHalf, sameMarks } from './geometry';

/** Width the map is drawn at; the rail shows its right-hand part at rest. */
const MAP_WIDTH = 56;
/** The fore-edge strip: its width and its distance from the rail's right edge (px). */
const STRIP_WIDTH = 10;
const STRIP_X = MAP_WIDTH - 7 - STRIP_WIDTH;
/** Page boundaries are ruled on the strip while pages are at least this tall (px). */
const PAGE_RULE_MIN = 7;
/** Chapter tabs closer than this (px) are skipped; tabs are 16px tall. */
const TAB_GAP = 18;

interface ForeEdgeProps {
  chapters: RailChapter[];
  pageCount: number;
  /** Track height in px. */
  height: number;
  marks: RailMark[];
}

/** The book's fore-edge: page rules, chapter dividers and every annotation, as one SVG. */
export const ForeEdge = memo(
  function ForeEdge({ chapters, pageCount, height, marks }: ForeEdgeProps) {
    const yOfPage = (page: number) => roundHalf(((page - 1) / pageCount) * height);
    const right = STRIP_X + STRIP_WIDTH;

    let rules = '';
    if (height / pageCount >= PAGE_RULE_MIN) {
      for (let page = 2; page <= pageCount; page++) rules += `M${STRIP_X} ${yOfPage(page)}h${STRIP_WIDTH}`;
    }
    let dividers = '';
    for (const chapter of chapters) {
      if (chapter.startPage > 1)
        dividers += `M${STRIP_X - 2} ${yOfPage(chapter.startPage)}h${STRIP_WIDTH + 2}`;
    }

    return (
      <svg
        className="book-map__edge"
        width={MAP_WIDTH}
        height={height}
        viewBox={`0 0 ${MAP_WIDTH} ${height}`}
        aria-hidden="true"
        focusable="false"
      >
        <rect className="book-map__paper" x={STRIP_X} y={0} width={STRIP_WIDTH} height={height} rx={2} />
        {rules && <path className="book-map__rules" d={rules} />}
        {dividers && <path className="book-map__dividers" d={dividers} />}
        <rect
          className="book-map__outline"
          x={STRIP_X + 0.5}
          y={0.5}
          width={STRIP_WIDTH - 1}
          height={Math.max(0, height - 1)}
          rx={1.5}
        />
        {marks.map((mark) => {
          if (mark.kind === 'highlight') {
            return (
              <rect
                key={mark.key}
                className="book-map__highlight"
                data-note-color={mark.color}
                x={STRIP_X + 1}
                y={mark.y - 1}
                width={STRIP_WIDTH - 2}
                height={2}
                rx={0.5}
              />
            );
          }
          if (mark.kind === 'note') {
            return (
              <circle
                key={mark.key}
                className="book-map__note"
                data-note-color={mark.color}
                cx={STRIP_X + STRIP_WIDTH / 2}
                cy={mark.y}
                r={2.6}
              />
            );
          }
          // A bookmark ribbon tucked into the fore-edge, its notched tail sticking out.
          return (
            <path
              key={mark.key}
              className="book-map__ribbon"
              d={`M${right - 3} ${Math.max(0, mark.y)}h8l-2 2.5l2 2.5h-8z`}
            />
          );
        })}
      </svg>
    );
  },
  (a, b) =>
    a.chapters === b.chapters &&
    a.pageCount === b.pageCount &&
    a.height === b.height &&
    sameMarks(a.marks, b.marks),
);

interface ChapterTabsProps {
  chapters: RailChapter[];
  pageCount: number;
  height: number;
  currentChapter: number;
}

/** Chapter numbers beside the strip, revealed when the rail opens — a thumb index. */
export const ChapterTabs = memo(function ChapterTabs({
  chapters,
  pageCount,
  height,
  currentChapter,
}: ChapterTabsProps) {
  let lastY = Number.NEGATIVE_INFINITY;
  return (
    <div className="book-map__tabs" aria-hidden="true">
      {chapters.map((chapter, index) => {
        if (!chapter.label) return null;
        const top = ((chapter.startPage - 1) / pageCount) * height;
        const bottom = ((chapter.endPage - 1) / pageCount) * height;
        // Centred on short chapters, near the top of long ones.
        const y = bottom - top >= TAB_GAP ? top + TAB_GAP / 2 : (top + bottom) / 2;
        if (y - lastY < TAB_GAP && index !== currentChapter) return null;
        lastY = y;
        return (
          <span
            key={`${chapter.startPage}:${chapter.title}`}
            className={`book-map__tab${index === currentChapter ? ' is-current' : ''}`}
            style={{ top: y }}
          >
            {chapter.label}
          </span>
        );
      })}
    </div>
  );
});
