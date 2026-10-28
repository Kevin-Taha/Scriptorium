import { useMemo } from 'react';
import { Clock3 } from 'lucide-react';
import { useHistoryStore } from '@/features/navigation/historyStore';
import { pageLabelFor } from '@/features/navigation/pageLabels';
import { useReaderStore } from '@/features/reader/readerStore';
import { secondsPerPage, useReadingLogStore } from '../shared/readingLog';
import type { ExperimentModule } from '../types';
import {
  buildChapterSpans,
  chapterProgress,
  findCurrentChapter,
  formatTimeLeft,
  minutesLeft,
  pagesLeft,
} from './chapters';
import './chapter-progress.css';

function useChapters() {
  const outline = useReaderStore((s) => s.outline);
  const count = useReaderStore((s) => s.pdf?.numPages ?? s.doc?.pageCount ?? 0);
  return useMemo(() => buildChapterSpans(outline, count), [outline, count]);
}

function ChapterStrip() {
  const chapters = useChapters();
  const location = useReaderStore((s) => s.location);
  const labels = useReaderStore((s) => s.pageLabels);
  const current = findCurrentChapter(chapters, location);

  return (
    <div className="chapter-strip" role="group" aria-label="Chapters">
      {chapters.map((chapter, index) => {
        const progress = chapterProgress(chapter, location);
        const range = `pp. ${pageLabelFor(labels, chapter.startPage)}–${pageLabelFor(labels, chapter.endPage - 1)}`;
        const description = `${chapter.title} · ${range} · ${Math.round(progress * 100)}% read`;
        return (
          <button
            type="button"
            className={`chapter-strip__segment${chapter === current ? ' is-current' : ''}${progress === 1 && chapter !== current ? ' is-complete' : ''}`}
            style={{ flexGrow: chapter.endPage - chapter.startPage }}
            key={chapter.startPage}
            aria-label={description}
            onClick={() => useHistoryStore.getState().jumpTo(chapter.location)}
          >
            <span className="chapter-strip__fill" style={{ width: `${progress * 100}%` }} />
            <span
              className={`chapter-strip__tooltip${index === 0 ? ' is-first' : ''}${index === chapters.length - 1 ? ' is-last' : ''}`}
              aria-hidden="true"
            >
              {description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TimeLeft() {
  const chapters = useChapters();
  const location = useReaderStore((s) => s.location);
  const docId = useReaderStore((s) => s.docId);
  const log = useReadingLogStore((s) => s.log);
  const chapter = findCurrentChapter(chapters, location);
  if (!chapter || !docId) return null;
  const pace = secondsPerPage(log, docId);
  const remaining = pagesLeft(chapter, location);
  const title = `${remaining.toFixed(1)} pages left in ${chapter.title} · your pace ≈ ${(pace / 60).toFixed(1)} min/page`;
  return (
    <span className="chapter-time" title={title}>
      <Clock3 aria-hidden="true" />
      {formatTimeLeft(minutesLeft(chapter, location, pace))} left in{' '}
      {chapter.title === 'Book' ? 'book' : 'chapter'}
    </span>
  );
}

const experiment: ExperimentModule = { ReaderToolbar: TimeLeft, ReaderToolbarStrip: ChapterStrip };
export default experiment;
