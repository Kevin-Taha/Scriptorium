import { useMemo } from 'react';
import { Clock, FileX } from 'lucide-react';
import { BookCover, isMissingFromFolder } from '@/features/library/BookCard';
import type { LibraryDocument, ReadingState } from '@/lib/types';
import { formatRelativeTime } from '@/lib/util';
import { secondsPerPage, useReadingLogStore } from '../shared/readingLog';
import { BookMenu } from './BookMenu';
import { loadMeta } from './deskMeta';
import { formatDuration, secondsToday } from './heatmap';
import { type BookProgress, bookProgress, segmentFill } from './progress';

export interface DeskEntry {
  doc: LibraryDocument;
  reading?: ReadingState;
}

export function useBookProgress({ doc, reading }: DeskEntry): BookProgress {
  return useMemo(() => bookProgress(doc, reading, loadMeta(doc.id)), [doc, reading]);
}

export function DeskCover({ doc, size }: { doc: LibraryDocument; size: 'lg' | 'md' | 'sm' }) {
  return (
    <span className={`rd-cover rd-cover--${size}`} aria-hidden="true">
      <span className="rd-cover__pages" />
      <BookCover doc={doc} className="rd-cover__face" />
    </span>
  );
}

function chapterLabel(progress: BookProgress): string {
  if (!progress.hasChapters) return `${progress.percent}% of the book read`;
  const where =
    progress.chapterNumber !== null
      ? `chapter ${progress.chapterNumber} of ${progress.chapterCount}`
      : 'the opening pages';
  return `In ${where}, ${progress.percent}% of the book read`;
}

/** Book progress drawn as one segment per chapter, the current chapter emphasised. */
export function ChapterBar({ progress, size }: { progress: BookProgress; size: 'lg' | 'sm' }) {
  return (
    <span className={`rd-chapters rd-chapters--${size}`} role="img" aria-label={chapterLabel(progress)}>
      {progress.segments.map((segment, index) => {
        const state = index < progress.current ? 'done' : index === progress.current ? 'current' : 'ahead';
        const fill = segmentFill(segment, progress.position);
        return (
          <span
            key={`${segment.start}-${segment.title}`}
            className={`rd-chapters__segment is-${state} ${segment.front ? 'is-front' : ''}`}
            style={{ flexGrow: segment.end - segment.start + 1 }}
            title={
              segment.title
                ? `${segment.title} · pp. ${segment.start}–${segment.end}`
                : `Pages ${segment.start}–${segment.end}`
            }
          >
            <span className="rd-chapters__fill" style={{ width: `${fill * 100}%` }} />
          </span>
        );
      })}
    </span>
  );
}

function pageLine(progress: BookProgress): string {
  return progress.pageCount > 0 ? `Page ${progress.page} of ${progress.pageCount}` : `Page ${progress.page}`;
}

/** The book you were reading most recently, front and centre. */
export function HeroCard({ entry, onOpen }: { entry: DeskEntry; onOpen(): void }) {
  const { doc } = entry;
  const progress = useBookProgress(entry);
  const log = useReadingLogStore((s) => s.log);
  const today = secondsToday(log, doc.id);
  const leftSeconds = progress.hasChapters ? progress.chapterPagesLeft * secondsPerPage(log, doc.id) : 0;
  const section = progress.sectionTitle;
  return (
    <article className="rd-hero card" aria-labelledby={`rd-hero-${doc.id}`}>
      <button
        type="button"
        tabIndex={-1}
        className="rd-cover-button"
        onClick={onOpen}
        aria-label={`Open ${doc.title}`}
      >
        <DeskCover doc={doc} size="lg" />
      </button>
      <div className="rd-hero__body">
        <p className="rd-hero__eyebrow">
          <span>NOW READING</span>
          <span aria-hidden="true">·</span>
          <span className="rd-hero__when">Opened {formatRelativeTime(doc.lastOpenedAt)}</span>
        </p>
        <h3 className="rd-hero__title" id={`rd-hero-${doc.id}`}>
          {doc.title}
        </h3>
        {progress.chapterTitle ? (
          <p className="rd-hero__chapter">
            {progress.chapterTitle}
            {section && (
              <>
                <span className="rd-hero__divider" aria-hidden="true">
                  /
                </span>
                <span className="rd-hero__section">{section}</span>
              </>
            )}
          </p>
        ) : (
          <p className="rd-hero__chapter rd-hero__chapter--quiet">
            Chapters appear once you’ve opened it with the desk on
          </p>
        )}
        <ChapterBar progress={progress} size="lg" />
        <p className="rd-hero__numbers">
          <span>
            {progress.chapterNumber !== null
              ? `Chapter ${progress.chapterNumber} of ${progress.chapterCount}`
              : ''}
          </span>
          <span>{pageLine(progress)}</span>
          <span className="rd-hero__percent">{progress.percent}%</span>
        </p>
        <div className="rd-hero__actions">
          <button
            type="button"
            className="btn btn--primary rd-hero__continue"
            onClick={onOpen}
            aria-label={`Continue reading ${doc.title}`}
          >
            Continue
          </button>
          <p className="rd-hero__time">
            <Clock aria-hidden="true" />
            <span>{today >= 60 ? `${formatDuration(today)} today` : 'Not read yet today'}</span>
            {leftSeconds >= 60 && (
              <>
                <span aria-hidden="true">·</span>
                <span>about {formatDuration(leftSeconds)} left in this chapter</span>
              </>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}

/** A compact book row: cover, chapter progress and a Continue/Start button. */
export function BookRow({
  entry,
  onOpen,
  onRemove,
}: {
  entry: DeskEntry;
  onOpen(): void;
  onRemove?(opener: HTMLButtonElement | null): void;
}) {
  const { doc } = entry;
  const progress = useBookProgress(entry);
  const log = useReadingLogStore((s) => s.log);
  const today = secondsToday(log, doc.id);
  const missing = isMissingFromFolder(doc);
  const where =
    progress.sectionTitle ??
    progress.chapterTitle ??
    (progress.opened ? `${progress.percent}% read` : 'Not started');
  const meta: string[] = [];
  if (!progress.opened) {
    if (progress.pageCount) {
      meta.push(`${progress.pageCount} pages`);
      meta.push(`about ${formatDuration(progress.pageCount * secondsPerPage(log))}`);
    } else meta.push('Not opened yet');
  } else if (progress.finished) meta.push('Finished');
  else meta.push(progress.pageCount ? `p. ${progress.page} of ${progress.pageCount}` : `p. ${progress.page}`);
  if (today >= 60) meta.push(`${formatDuration(today)} today`);
  else if (progress.opened) meta.push(formatRelativeTime(doc.lastOpenedAt));
  const action = !progress.opened ? 'Start' : progress.finished ? 'Open' : 'Continue';
  return (
    <article className={`rd-row ${missing ? 'is-missing' : ''}`} aria-labelledby={`rd-row-${doc.id}`}>
      <button
        type="button"
        tabIndex={-1}
        className="rd-cover-button"
        onClick={onOpen}
        aria-label={`Open ${doc.title}`}
      >
        <DeskCover doc={doc} size="sm" />
      </button>
      <div className="rd-row__body">
        <h3 className="rd-row__title" id={`rd-row-${doc.id}`} title={doc.title}>
          {doc.title}
        </h3>
        {missing ? (
          <p className="rd-row__where rd-row__missing">
            <FileX aria-hidden="true" />
            File missing from folder
          </p>
        ) : (
          <p className="rd-row__where">{where}</p>
        )}
        <ChapterBar progress={progress} size="sm" />
        <p className="rd-row__meta">{meta.join(' · ')}</p>
      </div>
      <div className="rd-row__actions">
        <button
          type="button"
          className="btn btn--sm rd-row__continue"
          onClick={onOpen}
          aria-disabled={missing || undefined}
          aria-label={`${action} ${doc.title}${missing ? ', file missing from folder' : ''}`}
        >
          {action}
        </button>
        {onRemove && <BookMenu doc={doc} onRemove={onRemove} />}
      </div>
    </article>
  );
}
