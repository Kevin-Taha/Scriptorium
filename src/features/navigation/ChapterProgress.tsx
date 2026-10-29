import { type KeyboardEvent, memo, useMemo } from 'react';
import { clamp } from '@/lib/util';
import { useReaderStore } from '../reader/readerStore';
import { buildChapterSpans, chapterProgress, findCurrentChapter } from './chapterProgressModel';
import { useHistoryStore } from './historyStore';
import { formatPageRef, pageLabelFor } from './pageLabels';
import './chapterProgress.css';

const KEY_TARGET: Record<string, (from: number, last: number) => number> = {
  ArrowLeft: (from) => from - 1,
  ArrowRight: (from) => from + 1,
  Home: () => 0,
  End: (_, last) => last,
};

export const ChapterProgress = memo(function ChapterProgress() {
  const outline = useReaderStore((s) => s.outline);
  const count = useReaderStore((s) => s.pdf?.numPages ?? s.doc?.pageCount ?? 0);
  const page = useReaderStore((s) => s.location.page);
  const labels = useReaderStore((s) => s.pageLabels);
  const chapters = useMemo(() => buildChapterSpans(outline, count), [outline, count]);
  if (!chapters.length) return null;
  const current = findCurrentChapter(chapters, page);

  // The strip is one tab stop (the current chapter); arrows, Home and End move between segments.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = KEY_TARGET[event.key];
    if (!target || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const segments = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('.chapter-progress__segment'),
    );
    const last = segments.length - 1;
    event.preventDefault();
    segments[clamp(target(segments.indexOf(event.target as HTMLElement), last), 0, last)].focus();
  };

  return (
    <div className="chapter-progress" role="group" aria-label="Chapters" onKeyDown={onKeyDown}>
      {chapters.map((chapter) => {
        const progress = chapterProgress(chapter, page);
        const isCurrent = chapter === current;
        const pagesLeft = chapter.endPage - 1 - page;
        const status = isCurrent
          ? `${pagesLeft} ${pagesLeft === 1 ? 'page' : 'pages'} left`
          : progress === 0
            ? 'not started'
            : `${Math.round(progress * 100)}% read`;
        const lastPage = chapter.endPage - 1;
        const range =
          chapter.startPage === lastPage
            ? formatPageRef(labels, chapter.startPage)
            : `pp. ${pageLabelFor(labels, chapter.startPage)}–${pageLabelFor(labels, lastPage)}`;
        const description = `${chapter.title} · ${range} · ${status}`;
        const width = chapter.endPage - chapter.startPage;

        return (
          <div
            className="chapter-progress__item"
            key={chapter.startPage}
            style={{ flexGrow: width }}
            // Tooltips line up with the nearer end of the strip, so they never run off the window.
            data-end={chapter.startPage + width / 2 > count / 2 || undefined}
          >
            <button
              type="button"
              className={`chapter-progress__segment${isCurrent ? ' is-current' : ''}`}
              tabIndex={isCurrent ? 0 : -1}
              aria-label={description}
              aria-current={isCurrent ? 'location' : undefined}
              onClick={() => useHistoryStore.getState().jumpTo(chapter.location)}
            >
              <span className="chapter-progress__fill" style={{ width: `${progress * 100}%` }} />
            </button>
            <span className="chapter-progress__tooltip" aria-hidden="true">
              {description}
            </span>
          </div>
        );
      })}
    </div>
  );
});
