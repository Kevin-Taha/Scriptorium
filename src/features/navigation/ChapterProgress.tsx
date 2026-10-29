import { type FocusEvent, type KeyboardEvent, memo, useMemo, useState } from 'react';
import { useReaderStore } from '../reader/readerStore';
import {
  buildChapterSpans,
  chapterProgress,
  findCurrentChapter,
  pagesLeft,
  stepSegment,
} from './chapterProgressModel';
import { useHistoryStore } from './historyStore';
import { formatPageRef, pageLabelFor } from './pageLabels';
import './chapterProgress.css';

export const ChapterProgress = memo(function ChapterProgress() {
  const outline = useReaderStore((s) => s.outline);
  const count = useReaderStore((s) => s.pdf?.numPages ?? s.doc?.pageCount ?? 0);
  const page = useReaderStore((s) => s.location.page);
  const labels = useReaderStore((s) => s.pageLabels);
  const chapters = useMemo(() => buildChapterSpans(outline, count), [outline, count]);
  const current = findCurrentChapter(chapters, page);
  // The strip is one tab stop: the segment last focused while focus is inside it, else the current chapter.
  const [focused, setFocused] = useState<number | null>(null);

  if (!chapters.length) return null;

  const tabStop = focused !== null && focused < chapters.length ? focused : chapters.indexOf(current!);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const segments = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('.chapter-progress__segment'),
    );
    const next = stepSegment(event.key, segments.indexOf(event.target as HTMLElement), segments.length);
    if (next === null) return;
    event.preventDefault();
    segments[next].focus();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null);
  };

  return (
    <div
      className="chapter-progress"
      role="group"
      aria-label="Chapters"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {chapters.map((chapter, index) => {
        const progress = chapterProgress(chapter, page);
        const isCurrent = chapter === current;
        const remaining = pagesLeft(chapter, page);
        const status = isCurrent
          ? `${remaining} ${remaining === 1 ? 'page' : 'pages'} left`
          : progress === 0
            ? 'not started'
            : `${Math.round(progress * 100)}% read`;
        const endPage = chapter.endPage - 1;
        const range =
          chapter.startPage === endPage
            ? formatPageRef(labels, chapter.startPage)
            : `pp. ${pageLabelFor(labels, chapter.startPage)}–${pageLabelFor(labels, endPage)}`;
        const description = `${chapter.title} · ${range} · ${status}`;
        const width = chapter.endPage - chapter.startPage;
        const center = (chapter.startPage - 1 + width / 2) / count;

        return (
          <div className="chapter-progress__item" key={chapter.startPage} style={{ flexGrow: width }}>
            <button
              type="button"
              className={`chapter-progress__segment${isCurrent ? ' is-current' : ''}${!isCurrent && progress === 1 ? ' is-complete' : ''}`}
              tabIndex={index === tabStop ? 0 : -1}
              aria-label={description}
              aria-current={isCurrent ? 'location' : undefined}
              onFocus={() => setFocused(index)}
              onClick={() => useHistoryStore.getState().jumpTo(chapter.location)}
            >
              <span className="chapter-progress__fill" style={{ width: `${progress * 100}%` }} />
            </button>
            <span
              className="chapter-progress__tooltip"
              aria-hidden="true"
              style={{
                left: `calc((100% - ${(chapters.length - 1) * 2}px) * ${center} + ${index * 2}px)`,
                transform: `translateX(-${center * 100}%)`,
              }}
            >
              {description}
            </span>
          </div>
        );
      })}
    </div>
  );
});
