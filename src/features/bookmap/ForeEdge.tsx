import { memo } from 'react';
import type { ChapterSpan } from '../navigation/chapterProgressModel';
import { chapterLabel, type RailMark, sameMarks } from './geometry';

/** Tabs are 16px tall; ones closer than this are skipped, except the current chapter's. */
const TAB_GAP = 18;

interface ForeEdgeProps {
  chapters: ChapterSpan[];
  current: ChapterSpan | null;
  pageCount: number;
  /** Track height in px. */
  height: number;
  marks: RailMark[];
}

/** The book's fore-edge (chapter dividers and every annotation) and its thumb index of chapter tabs. */
export const ForeEdge = memo(
  function ForeEdge({ chapters, current, pageCount, height, marks }: ForeEdgeProps) {
    const yOf = (page: number) => Math.round(((page - 1) / pageCount) * height * 2) / 2;
    let dividers = '';
    for (const chapter of chapters) if (chapter.startPage > 1) dividers += `M5 ${yOf(chapter.startPage)}h12`;
    let lastTab = Number.NEGATIVE_INFINITY;

    return (
      <>
        <svg className="book-map__edge" width={24} height={height} aria-hidden="true">
          <rect className="book-map__strip" x={7.5} y={0.5} width={9} height={height - 1} rx={1.5} />
          <path className="book-map__dividers" d={dividers} />
          {marks.map(({ key, kind, y, color }) =>
            kind === 'highlight' ? (
              <rect
                key={key}
                className="book-map__highlight"
                data-note-color={color}
                x={8}
                y={y - 1}
                width={8}
                height={2}
              />
            ) : kind === 'note' ? (
              <circle key={key} className="book-map__note" data-note-color={color} cx={12} cy={y} r={2.6} />
            ) : (
              <path key={key} className="book-map__ribbon" d={`M14 ${y}h8l-2 2.5l2 2.5h-8z`} />
            ),
          )}
        </svg>
        <div className="book-map__tabs" aria-hidden="true">
          {chapters.map((chapter) => {
            const label = chapterLabel(chapter.title);
            const top = yOf(chapter.startPage);
            // Near the top of a long chapter, centred on a short one.
            const y = Math.min(top + TAB_GAP / 2, (top + yOf(chapter.endPage)) / 2);
            if (!label || (y - lastTab < TAB_GAP && chapter !== current)) return null;
            lastTab = y;
            return (
              <span
                key={chapter.startPage}
                className={`book-map__tab${chapter === current ? ' is-current' : ''}`}
                style={{ top: y }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </>
    );
  },
  (a, b) =>
    a.chapters === b.chapters &&
    a.current === b.current &&
    a.pageCount === b.pageCount &&
    a.height === b.height &&
    sameMarks(a.marks, b.marks),
);
